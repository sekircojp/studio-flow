-- =============================================================================
-- 017: 定期実行（pg_cron）
--   設計書 5.4（月次請求の生成は pg_cron で行う）に対応
--   MarcheBase の定期実行と同じ仕組み（設計書 10.5）
--
-- ★ pg_cron は UTC で動く。日本時間で指定してはいけない。
--   毎月1日の朝9時（JST）に動かしたいなら、UTC では前月末日の 0 時になる。
--   月末は月によって日数が違うので、この書き方はできない。
--   そこで「毎日 UTC 0時（＝JST 朝9時）に起動し、JST で1日かどうかを
--   関数側で判定する」形にする。
--
-- ★ 役割チェックの扱い
--   public.generate_invoices() は app.has_org_role() で呼び出し元を検査する。
--   cron から呼ぶと auth.uid() が null になり必ず forbidden になる。
--   そのため cron 用の入口を別に用意し、そこでは役割検査を行わない。
--   実行権限は postgres だけに与え、authenticated からは呼べないようにする。
-- =============================================================================

create extension if not exists pg_cron with schema extensions;


-- =============================================================================
-- app.run_monthly_invoice_generation
--
-- JST で毎月1日のときだけ、全テナントの当月分の請求を作る。
-- 既に作られている月は generate_invoices() 側が skip するので、
-- 二重に走っても請求が増えることはない。
-- =============================================================================
create or replace function app.run_monthly_invoice_generation()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today  date := (now() at time zone 'Asia/Tokyo')::date;
  v_month  date := date_trunc('month', v_today)::date;
  v_org    record;
  v_total  integer := 0;
begin
  -- JST の1日以外は何もしない
  if extract(day from v_today) <> 1 then
    return;
  end if;

  for v_org in
    select id from public.organizations where status = 'active'
  loop
    -- cron は postgres として動くので auth.uid() が null になり、
    -- public.generate_invoices() の役割検査を通れない。
    -- 検査を持たない内部関数を直接呼ぶ。
    perform app.generate_invoices_internal(v_org.id, v_month);
    v_total := v_total + 1;
  end loop;

  raise notice 'monthly invoice generation done for % organizations (%)', v_total, v_month;
end;
$fn$;


-- =============================================================================
-- app.generate_invoices_internal
--
-- public.generate_invoices() から役割検査だけを外したもの。
-- 画面からは public.generate_invoices() を、cron からはこちらを使う。
--
-- 処理の中身を2か所に書くと片方だけ直して食い違うため、
-- public.generate_invoices() の側をこの関数の薄い包みに作り替える。
-- =============================================================================
create or replace function app.generate_invoices_internal(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (
  created          integer,
  skipped_existing integer,
  discounted       integer,
  total_amount     bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_month      date := date_trunc('month', p_billing_month)::date;
  v_month_end  date := (date_trunc('month', p_billing_month) + interval '1 month - 1 day')::date;
  v_settings   public.billing_settings%rowtype;
  v_due        date;
  v_created    integer := 0;
  v_skipped    integer := 0;
  v_discounted integer := 0;
  v_total      bigint := 0;
  c            record;
  s            record;
  v_amount     integer;
  v_invoice_id uuid;
  v_discount   integer;
  v_rank       integer;
begin
  select * into v_settings
  from public.billing_settings
  where organization_id = p_organization_id;

  if not found then
    insert into public.billing_settings (organization_id)
    values (p_organization_id)
    returning * into v_settings;
  end if;

  v_due := v_month + (v_settings.due_day - 1);

  for c in
    select sc.*, st.household_id, st.status as student_status
    from public.student_contracts sc
    join public.students st
      on st.id = sc.student_id and st.organization_id = sc.organization_id
    where sc.organization_id = p_organization_id
      and sc.status in ('active', 'suspended_billed')
      and sc.start_date <= v_month_end
      and (sc.end_date is null or sc.end_date >= v_month)
    order by sc.student_id
  loop
    if exists (
      select 1 from public.invoices
      where student_id = c.student_id and billing_month = v_month
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if c.status = 'suspended_billed' then
      v_amount := coalesce(c.suspended_amount, 0);
    else
      v_amount := c.monthly_amount;
    end if;

    insert into public.invoices (
      organization_id, student_id, billing_month,
      subtotal, discount_total, total, tax_rate, tax_amount,
      due_date, status
    )
    values (
      p_organization_id, c.student_id, v_month,
      v_amount, 0, v_amount, c.tax_rate,
      app.tax_from_gross(v_amount, c.tax_rate),
      v_due, 'draft'
    )
    returning id into v_invoice_id;

    insert into public.invoice_items (organization_id, invoice_id, kind, description, amount)
    values (
      p_organization_id, v_invoice_id, 'tuition',
      case when c.status = 'suspended_billed' then '休会費' else '月謝' end,
      v_amount
    );

    v_created := v_created + 1;
  end loop;

  -- 兄弟割（設計書 5.5）
  if v_settings.sibling_discount_enabled then
    for s in
      select
        i.id as invoice_id,
        i.subtotal,
        row_number() over (
          partition by st.household_id
          order by i.subtotal desc, i.id
        ) as rn
      from public.invoices i
      join public.students st
        on st.id = i.student_id and st.organization_id = i.organization_id
      where i.organization_id = p_organization_id
        and i.billing_month = v_month
        and i.status = 'draft'
        and (
          v_settings.count_suspended_in_siblings
          or st.status not in ('suspended_billed', 'suspended_unbilled')
        )
    loop
      v_rank := s.rn;
      if v_rank = 1 then continue; end if;
      if v_settings.sibling_discount_target = 'second_only' and v_rank > 2 then
        continue;
      end if;

      if v_settings.sibling_discount_type = 'fixed' then
        v_discount := least(v_settings.sibling_discount_amount, s.subtotal);
      else
        v_discount := least(
          floor(s.subtotal::numeric * v_settings.sibling_discount_rate)::integer,
          s.subtotal
        );
      end if;

      if v_discount <= 0 then continue; end if;

      insert into public.invoice_items (organization_id, invoice_id, kind, description, amount)
      values (p_organization_id, s.invoice_id, 'discount', '兄弟割', -v_discount);

      v_discounted := v_discounted + 1;
    end loop;
  end if;

  update public.invoices i
  set
    discount_total = d.discount_total,
    total          = d.gross,
    tax_amount     = app.tax_from_gross(d.gross, i.tax_rate),
    status         = 'issued',
    issued_at      = now()
  from (
    select
      it.invoice_id,
      sum(case when it.amount < 0 then -it.amount else 0 end)::integer as discount_total,
      greatest(sum(it.amount), 0)::integer as gross
    from public.invoice_items it
    join public.invoices iv on iv.id = it.invoice_id
    where iv.organization_id = p_organization_id
      and iv.billing_month = v_month
      and iv.status = 'draft'
    group by it.invoice_id
  ) d
  where i.id = d.invoice_id;

  select coalesce(sum(total), 0) into v_total
  from public.invoices
  where organization_id = p_organization_id and billing_month = v_month;

  return query select v_created, v_skipped, v_discounted, v_total;
end;
$fn$;


-- public.generate_invoices() を、役割検査＋内部関数の呼び出しに作り替える。
-- 処理の中身が2か所にあると、片方だけ直して食い違うため。
create or replace function public.generate_invoices(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (
  created          integer,
  skipped_existing integer,
  discounted       integer,
  total_amount     bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
    select * from app.generate_invoices_internal(p_organization_id, p_billing_month);
end;
$fn$;


-- =============================================================================
-- app.run_transfer_credit_expiry
--
-- 期限切れの振替権を閉じる（設計書 5.3）。行は消さず status を変える。
-- =============================================================================
create or replace function app.run_transfer_credit_expiry()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  with expired as (
    update public.transfer_credits
    set status = 'expired'
    where status = 'available'
      and expires_at < (now() at time zone 'Asia/Tokyo')::date
    returning 1
  )
  select count(*) into v_count from expired;

  if v_count > 0 then
    raise notice 'expired % transfer credits', v_count;
  end if;
end;
$fn$;


-- =============================================================================
-- 実行権限
--
-- どちらも cron（postgres）からしか呼ばせない。
-- authenticated に渡すと、他テナントの請求まで作れてしまう。
-- =============================================================================
revoke all on function app.run_monthly_invoice_generation() from public, anon, authenticated;
revoke all on function app.run_transfer_credit_expiry() from public, anon, authenticated;
revoke all on function app.generate_invoices_internal(uuid, date) from public, anon, authenticated;

revoke all on function public.generate_invoices(uuid, date) from public, anon;
grant execute on function public.generate_invoices(uuid, date) to authenticated;


-- =============================================================================
-- 登録
--
-- ★ pg_cron は UTC。'0 0 * * *' は UTC 0時 ＝ JST 朝9時。
--   毎日起動し、JST で1日かどうかは関数側で判定する。
--   月末の日数が月ごとに違うため、cron 式で「JST の1日」は表せない。
-- =============================================================================
select cron.unschedule('monthly-invoice-generation')
where exists (select 1 from cron.job where jobname = 'monthly-invoice-generation');

select cron.schedule(
  'monthly-invoice-generation',
  '0 0 * * *',
  $cron$ select app.run_monthly_invoice_generation(); $cron$
);

select cron.unschedule('expire-transfer-credits')
where exists (select 1 from cron.job where jobname = 'expire-transfer-credits');

select cron.schedule(
  'expire-transfer-credits',
  '0 0 * * *',
  $cron$ select app.run_transfer_credit_expiry(); $cron$
);

-- 確認方法:
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
