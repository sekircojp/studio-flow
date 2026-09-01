-- =============================================================================
-- 013: 請求設定と、月次請求の生成
--   設計書 5.4（月次請求の生成）/ 5.5（兄弟割）に対応
-- =============================================================================

-- =============================================================================
-- billing_settings: 請求まわりの組織設定
--
-- ★ 設計書 4章に無いテーブル
--   設計書 5.5 は兄弟割を「設定項目」として定義しているが、その置き場が
--   4章のデータモデルに無い。組織ごとに1行持たせる。
-- =============================================================================
create table public.billing_settings (
  organization_id uuid primary key
                    references public.organizations (id) on delete cascade,

  -- 兄弟割（設計書 5.5）
  sibling_discount_enabled boolean not null default false,
  -- second_only 2人目のみ / second_and_beyond 2人目以降全員
  sibling_discount_target  text not null default 'second_and_beyond'
                             check (sibling_discount_target in ('second_only', 'second_and_beyond')),
  -- fixed 定額（円） / rate 率
  sibling_discount_type    text not null default 'fixed'
                             check (sibling_discount_type in ('fixed', 'rate')),
  sibling_discount_amount  integer not null default 0 check (sibling_discount_amount >= 0),
  sibling_discount_rate    numeric(5, 4) not null default 0
                             check (sibling_discount_rate >= 0 and sibling_discount_rate <= 1),

  -- 休会中の生徒を人数に数えるか。既定は「数える」（設計書 5.5）。
  -- 数えない設定にすると、兄が休会した瞬間に弟の割引が消える
  count_suspended_in_siblings boolean not null default true,

  -- 支払期限。請求月の何日か
  due_day         integer not null default 27 check (due_day between 1 and 28),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.billing_settings is '請求まわりの組織設定。兄弟割の条件を持つ（設計書 5.5）。';
comment on column public.billing_settings.count_suspended_in_siblings is
  '休会中の生徒を兄弟の人数に数えるか。既定は数える。数えないと兄の休会で弟の割引が消える。';

create trigger billing_settings_set_updated_at
  before update on public.billing_settings
  for each row execute function app.set_updated_at();

revoke all on table public.billing_settings from anon;
grant select, insert, update on table public.billing_settings to authenticated;
grant all on table public.billing_settings to service_role;
alter table public.billing_settings enable row level security;

create policy "オーナーとスタッフは請求設定を参照できる"
  on public.billing_settings for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーは請求設定を作成できる"
  on public.billing_settings for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));

create policy "オーナーは請求設定を更新できる"
  on public.billing_settings for update to authenticated
  using (app.has_org_role(organization_id, array['owner']))
  with check (app.has_org_role(organization_id, array['owner']));


-- =============================================================================
-- 消費税額の算出
--
-- 税込金額と税率から逆算する。税込 11,000 円・税率 10% なら 1,000 円。
-- 端数は切り捨て。整数（円）で扱い、浮動小数点は使わない（設計書 2.2）。
-- =============================================================================
create or replace function app.tax_from_gross(gross integer, rate numeric)
returns integer
language sql
immutable
set search_path = ''
as $fn$
  select floor(gross::numeric * rate / (1 + rate))::integer;
$fn$;


-- =============================================================================
-- generate_invoices: 月次請求の生成（設計書 5.4）
--
--   1. status が active または suspended_billed の契約を抽出
--   2. 各契約について当月の invoice を作成（status = draft）
--      - suspended_billed → 休会費の金額を使用
--      - suspended_unbilled → 作成しない
--   3. 兄弟割を適用（5.5）
--   4. 合計・消費税額を確定
--   5. status = issued へ
--
-- 既に作られている月は作り直さない。金額を直したい場合は請求を個別に編集する
-- （入金済みの請求は編集できない・設計書 5.6）。
-- =============================================================================
create or replace function public.generate_invoices(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (
  created         integer,
  skipped_existing integer,
  discounted      integer,
  total_amount    bigint
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
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into v_settings
  from public.billing_settings
  where organization_id = p_organization_id;

  if not found then
    insert into public.billing_settings (organization_id)
    values (p_organization_id)
    returning * into v_settings;
  end if;

  v_due := v_month + (v_settings.due_day - 1);

  -- --- 1〜2. 契約から請求を作る ---
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
    -- 既にその月の請求があれば触らない
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

  -- --- 3. 兄弟割（設計書 5.5） ---
  -- 世帯ごとに月謝の高い順に並べ、2人目以降へ割引の明細を足す
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

      -- 1人目は割引しない。2人目のみか2人目以降かは設定による
      if v_rank = 1 then
        continue;
      end if;
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

      if v_discount <= 0 then
        continue;
      end if;

      insert into public.invoice_items (organization_id, invoice_id, kind, description, amount)
      values (p_organization_id, s.invoice_id, 'discount', '兄弟割', -v_discount);

      v_discounted := v_discounted + 1;
    end loop;
  end if;

  -- --- 4. 合計と消費税額を確定し、5. issued にする ---
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

comment on function public.generate_invoices(uuid, date) is
  '月次請求を生成する（設計書 5.4）。既にある月は作り直さない。兄弟割は世帯単位で判定する（5.5）。';

revoke all on function public.generate_invoices(uuid, date) from public, anon;
grant execute on function public.generate_invoices(uuid, date) to authenticated;


-- =============================================================================
-- 入金の登録に伴う請求状態の更新
--
-- 入金の合計と請求額を比べて、paid / partially_paid を切り替える。
-- アプリ側で状態を持つと、入金を訂正したときに更新漏れが起きる。
-- =============================================================================
create or replace function app.sync_invoice_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_invoice public.invoices%rowtype;
  v_paid    integer;
begin
  select * into v_invoice from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  if not found then
    return coalesce(new, old);
  end if;

  -- 取消済みの請求は触らない（設計書 5.6）
  if v_invoice.status = 'canceled' then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = v_invoice.id;

  update public.invoices
  set status = case
    when v_paid <= 0 then 'issued'
    when v_paid >= v_invoice.total then 'paid'
    else 'partially_paid'
  end
  where id = v_invoice.id;

  return coalesce(new, old);
end;
$fn$;

create trigger payments_sync_invoice
  after insert or update or delete on public.payments
  for each row execute function app.sync_invoice_payment_status();
