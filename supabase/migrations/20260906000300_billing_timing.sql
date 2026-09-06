-- =============================================================================
-- 026: 請求のタイミング（対象月のずらし方と、末日指定）
--   設計書 5.4 に対応
--
-- 月謝は定額の前払いが基本で、大多数は「当月分を当月の1日に請求」する。
-- ただし現場には他の運び方もある。
--
--   前月に作る … 7/25 に 8月分の請求書を配り、8月最初のレッスンで集金する
--   当月に作る … 8/1 に 8月分（大多数）
--   翌月に作る … 9/1 に 8月分（後払い）
--
-- そこで「対象月に対して、いつ作るか」をずらし幅で持つ。
--
--   issue_month_offset  -1 前月に作る / 0 当月 / +1 翌月
--   対象月 = date_trunc('month', 実行日) - issue_month_offset か月
--
-- ★ 締め日は持たない。
--   締め日が要るのは、月内の実績で金額が変わるとき（回数制・スポット・物販）。
--   フェーズ1は定額の月謝だけなので（設計書 9.1）、締める対象が無い。
--   「翌月に請求」を選んでも、金額は契約の定額であって実績集計ではない。
--   スポットや物販を入れる段になったら、そこで初めて締め日を設計する。
--
-- ★ 「末日」は日付の数字では表せない。
--   30 と書くと2月に来ない。31 なら4月にも来ない。真偽値で別に持つ。
--   支払期限の「月末払い」は実務で非常に多いので、こちらにも用意する。
-- =============================================================================

alter table public.billing_settings
  add column if not exists issue_month_offset integer not null default 0
    check (issue_month_offset between -1 and 1),
  add column if not exists issue_on_month_end boolean not null default false,
  add column if not exists due_on_month_end   boolean not null default false;

comment on column public.billing_settings.issue_month_offset is
  '対象月に対して、いつ請求を作るか。-1 前月 / 0 当月 / +1 翌月。';
comment on column public.billing_settings.issue_on_month_end is
  'true なら issue_day を無視して、その月の末日に作る。';
comment on column public.billing_settings.due_on_month_end is
  'true なら due_day を無視して、請求月の末日を支払期限にする。';


-- 「その月の N 日」または「その月の末日」を返す。
-- 末日は月ごとに日数が違うので、ここで一度だけ計算する
create or replace function app.month_day(
  p_month     date,
  p_day       integer,
  p_month_end boolean
)
returns date
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_month_end
      then (date_trunc('month', p_month) + interval '1 month - 1 day')::date
    else (date_trunc('month', p_month))::date + (greatest(coalesce(p_day, 1), 1) - 1)
  end;
$fn$;

comment on function app.month_day(date, integer, boolean) is
  'その月の N 日、または末日を返す。末日は月ごとに日数が違うためここで揃える。';


-- 生成バッチ。実行日が各組織の請求日にあたるかを見て、対象月を決める
create or replace function app.run_monthly_invoice_generation()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today   date := (now() at time zone 'Asia/Tokyo')::date;
  v_this    date := date_trunc('month', v_today)::date;
  v_org     record;
  v_fire_on date;
  v_month   date;
  v_total   integer := 0;
begin
  for v_org in
    select
      o.id,
      coalesce(bs.issue_day, 1)            as issue_day,
      coalesce(bs.issue_on_month_end, false) as issue_on_month_end,
      coalesce(bs.issue_month_offset, 0)   as issue_month_offset
    from public.organizations o
    left join public.billing_settings bs on bs.organization_id = o.id
    where o.status = 'active'
  loop
    -- その組織が請求を作る日
    v_fire_on := app.month_day(v_this, v_org.issue_day, v_org.issue_on_month_end);
    continue when v_fire_on <> v_today;

    -- 実行月から、ずらし幅のぶんだけ戻した月が対象月になる。
    --   前月に作る（-1）… 7月に実行 → 対象は 8月
    --   翌月に作る（+1）… 9月に実行 → 対象は 8月
    v_month := (v_this - (v_org.issue_month_offset || ' month')::interval)::date;

    -- cron は postgres として動くので auth.uid() が null になり、
    -- public.generate_invoices() の役割検査を通れない。
    -- 検査を持たない内部関数を直接呼ぶ。
    perform app.generate_invoices_internal(v_org.id, v_month);
    v_total := v_total + 1;
  end loop;

  raise notice 'monthly invoice generation done for % organizations (today %)', v_total, v_today;
end;
$fn$;

comment on function app.run_monthly_invoice_generation() is
  'JST で各組織の請求日にあたる日だけ、対象月の請求を作る（設計書 5.4）。'
  '毎日 UTC 0時（JST 9時）に起動し、日付と対象月の判定はこの中で行う。';


-- 支払期限の計算を「末日」に対応させる。他の処理は変えていない
CREATE OR REPLACE FUNCTION app.generate_invoices_internal(p_organization_id uuid, p_billing_month date)
 RETURNS TABLE(created integer, skipped_existing integer, discounted integer, total_amount bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_due := app.month_day(v_month, v_settings.due_day, v_settings.due_on_month_end);

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
$function$
;
