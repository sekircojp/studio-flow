-- =============================================================================
-- 012: 料金プラン・月謝契約・請求・入金
--   設計書 4.5 に対応
--
-- 設計書 1.2 の中核価値「現金でも月謝管理がきちんと回る」を支える部分。
--
-- ★ 4つを別エンティティとして厳格に分離する（設計書 4.5）
--     料金プラン → 生徒の月謝契約 → 月ごとの請求 → 入金結果
--   ひとつにまとめると、「プランの金額を変えたら過去の請求も変わる」
--   「一部入金が表せない」といった壊れ方をする。
--
-- ★ 金額は税込・整数（円）で持ち、税率を併せて持つ（設計書 2.2）
--   適格請求書には税率ごとの消費税額の記載が必要なため、税込金額だけでは
--   領収書を発行できない。消費税額も算出して保存する。後から税率が変わっても
--   過去の請求が再計算されないようにするため。
-- =============================================================================

-- =============================================================================
-- pricing_plans: 料金プラン
-- =============================================================================
create table public.pricing_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,

  -- 税込・整数（円）
  monthly_amount  integer not null check (monthly_amount >= 0),
  tax_rate        numeric(5, 4) not null default 0.10
                    check (tax_rate >= 0 and tax_rate < 1),

  enrollment_fee  integer not null default 0 check (enrollment_fee >= 0),
  annual_fee      integer not null default 0 check (annual_fee >= 0),
  registration_fee integer not null default 0 check (registration_fee >= 0),

  applies_from    date,
  is_public       boolean not null default false,
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id)
);

comment on table public.pricing_plans is '料金プラン。金額は税込・整数（円）。';
comment on column public.pricing_plans.monthly_amount is '月額。税込・整数（円）。契約時に student_contracts へ複写する。';

create index pricing_plans_organization_id_idx on public.pricing_plans (organization_id);

create trigger pricing_plans_set_updated_at
  before update on public.pricing_plans
  for each row execute function app.set_updated_at();


-- =============================================================================
-- student_contracts: 月謝契約
--
-- プランから金額を複写する。あとでプランの金額を変えても、
-- 契約済みの生徒の月謝が勝手に変わらないようにするため。
-- 個別の値引きもここで表す。
-- =============================================================================
create table public.student_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id      uuid not null,
  pricing_plan_id uuid,

  -- プランから複写。個別変更を許容（設計書 4.5）
  monthly_amount  integer not null check (monthly_amount >= 0),
  tax_rate        numeric(5, 4) not null default 0.10
                    check (tax_rate >= 0 and tax_rate < 1),

  payment_method  text not null default 'cash'
                    check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),

  start_date      date not null,
  end_date        date,

  status          text not null default 'active'
                    check (status in ('active', 'suspended_billed',
                                      'suspended_unbilled', 'ended')),
  -- 休会期間
  suspend_from    date,
  suspend_to      date,

  -- 休会中に請求する金額（suspended_billed のときに使う）
  suspended_amount integer check (suspended_amount is null or suspended_amount >= 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint student_contracts_period_order check (
    end_date is null or start_date <= end_date
  ),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,
  foreign key (pricing_plan_id, organization_id)
    references public.pricing_plans (id, organization_id) on delete set null,

  unique (id, organization_id)
);

comment on table public.student_contracts is '生徒の月謝契約。金額はプランから複写し、以後プランを変えても影響しない。';
comment on column public.student_contracts.status is
  'active 通常 / suspended_billed 休会（請求あり） / suspended_unbilled 休会（請求停止） / ended 終了。'
  '休会を2種類持つのは、休会費を設定した場合に請求が発生するため（設計書 5.4）。';

-- 1人の生徒に有効な契約が2つあると、二重請求になる
create unique index student_contracts_active_unique_idx
  on public.student_contracts (student_id)
  where status <> 'ended';

create index student_contracts_organization_id_idx on public.student_contracts (organization_id);

create trigger student_contracts_set_updated_at
  before update on public.student_contracts
  for each row execute function app.set_updated_at();


-- =============================================================================
-- invoices: 月次請求
--
-- ★ 状態を6つ以上明示的に持つ（設計書 4.5）
--   「支払済／未納」の2分割にすると、入金確認待ちや休会中請求停止が
--   契約件数と合わなくなる。ダッシュボードでは全状態の合計＝請求対象契約件数
--   で閉じること。
-- =============================================================================
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id      uuid not null,

  -- 請求対象月。月初日を入れる。日付だけの列なので変換しない（設計書 2.1）
  billing_month   date not null,

  subtotal        integer not null default 0 check (subtotal >= 0),
  discount_total  integer not null default 0 check (discount_total >= 0),
  total           integer not null default 0 check (total >= 0),
  tax_rate        numeric(5, 4) not null default 0.10,
  -- 税込金額と税率から算出して保存する。後から税率が変わっても
  -- 過去の請求が再計算されないようにするため（設計書 2.2）
  tax_amount      integer not null default 0 check (tax_amount >= 0),

  due_date        date,

  status          text not null default 'draft'
                    check (status in ('draft', 'issued', 'paid', 'partially_paid',
                                      'payment_failed', 'awaiting_confirmation',
                                      'canceled', 'suspended')),

  issued_at       timestamptz,
  canceled_at     timestamptz,
  cancel_reason   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,

  -- 同じ生徒の同じ月を2件作らない
  unique (student_id, billing_month),

  unique (id, organization_id)
);

comment on table public.invoices is '月次請求。生徒単位。状態の合計が請求対象契約件数と一致すること（設計書 13章）。';
comment on column public.invoices.billing_month is '請求対象月。月初日で持つ。';
comment on column public.invoices.tax_amount is '消費税額。税込金額と税率から算出して保存する。過去の請求が再計算されないようにするため。';

create index invoices_month_idx on public.invoices (organization_id, billing_month);
create index invoices_student_idx on public.invoices (student_id, billing_month desc);
create index invoices_unpaid_idx on public.invoices (organization_id, billing_month)
  where status in ('issued', 'partially_paid', 'payment_failed');

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function app.set_updated_at();


-- =============================================================================
-- invoice_items: 請求明細
-- =============================================================================
create table public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id      uuid not null,

  kind            text not null
                    check (kind in ('tuition', 'discount', 'enrollment_fee',
                                    'spot', 'event', 'costume', 'other')),
  description     text not null,

  -- 割引は負の値で持つ。合計を単純な足し算にするため
  amount          integer not null,

  created_at      timestamptz not null default now(),

  foreign key (invoice_id, organization_id)
    references public.invoices (id, organization_id) on delete cascade
);

comment on table public.invoice_items is '請求明細。割引は負の金額で持ち、合計を足し算だけで出せるようにする。';

create index invoice_items_invoice_idx on public.invoice_items (invoice_id);


-- =============================================================================
-- payments: 入金
--
-- 設計書 6.3: 初期の主経路は手動入金。管理者が現金・銀行振込を受け取り、
-- ここに登録する。この経路だけで月謝管理が完結することが必須要件。
-- =============================================================================
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id      uuid not null,

  method          text not null default 'cash'
                    check (method in ('cash', 'bank_transfer', 'card', 'other')),
  amount          integer not null check (amount > 0),
  paid_at         timestamptz not null default now(),

  recorded_by     uuid references auth.users (id) on delete set null,
  note            text,
  stripe_payment_intent_id text,

  created_at      timestamptz not null default now(),

  foreign key (invoice_id, organization_id)
    references public.invoices (id, organization_id) on delete restrict,

  unique (id, organization_id)
);

comment on table public.payments is '入金。1つの請求に複数件ありうる（分割払い・一部入金）。';

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_organization_id_idx on public.payments (organization_id, paid_at desc);


-- =============================================================================
-- refunds: 返金
--
-- 設計書 5.7: 初期実装では実際の返金操作は管理者の手動とし、
-- システムは記録のみを行う。
-- =============================================================================
create table public.refunds (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id      uuid not null,

  amount          integer not null check (amount > 0),
  refunded_at     timestamptz not null default now(),
  reason          text,
  recorded_by     uuid references auth.users (id) on delete set null,

  created_at      timestamptz not null default now(),

  foreign key (payment_id, organization_id)
    references public.payments (id, organization_id) on delete restrict
);

comment on table public.refunds is '返金の記録。実際の返金操作は手動（設計書 5.7）。';

create index refunds_payment_idx on public.refunds (payment_id);


-- =============================================================================
-- 権限と RLS
-- =============================================================================
revoke all on table public.pricing_plans     from anon;
revoke all on table public.student_contracts from anon;
revoke all on table public.invoices          from anon;
revoke all on table public.invoice_items     from anon;
revoke all on table public.payments          from anon;
revoke all on table public.refunds           from anon;

grant select, insert, update on table public.pricing_plans     to authenticated;
grant select, insert, update on table public.student_contracts to authenticated;
grant select, insert, update on table public.invoices          to authenticated;
grant select, insert, update on table public.invoice_items     to authenticated;
grant select, insert, update on table public.payments          to authenticated;
grant select, insert, update on table public.refunds           to authenticated;

grant all on table public.pricing_plans     to service_role;
grant all on table public.student_contracts to service_role;
grant all on table public.invoices          to service_role;
grant all on table public.invoice_items     to service_role;
grant all on table public.payments          to service_role;
grant all on table public.refunds           to service_role;

alter table public.pricing_plans     enable row level security;
alter table public.student_contracts enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;
alter table public.payments          enable row level security;
alter table public.refunds           enable row level security;


-- -----------------------------------------------------------------------------
-- ★ 講師には金額を見せない
--   設計書 7章:「講師は担当レッスン、出欠、生徒一覧。売上・報酬・未納は非表示」
--   そのため instructor をここの select ポリシーに含めない。
-- -----------------------------------------------------------------------------

create policy "オーナーとスタッフは料金プランを参照できる"
  on public.pricing_plans for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは料金プランを作成できる"
  on public.pricing_plans for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは料金プランを更新できる"
  on public.pricing_plans for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナー・スタッフ、および本人の世帯は契約を参照できる"
  on public.student_contracts for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは契約を作成できる"
  on public.student_contracts for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは契約を更新できる"
  on public.student_contracts for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナー・スタッフ、および本人の世帯は請求を参照できる"
  on public.invoices for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは請求を作成できる"
  on public.invoices for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは請求を更新できる"
  on public.invoices for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "請求を参照できる相手は明細も参照できる"
  on public.invoice_items for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or invoice_id in (
      select i.id from public.invoices i
      where i.student_id in (select app.current_student_ids())
    )
  );

create policy "オーナーとスタッフは明細を作成できる"
  on public.invoice_items for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは明細を更新できる"
  on public.invoice_items for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナー・スタッフ、および本人の世帯は入金を参照できる"
  on public.payments for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or invoice_id in (
      select i.id from public.invoices i
      where i.student_id in (select app.current_student_ids())
    )
  );

create policy "オーナーとスタッフは入金を登録できる"
  on public.payments for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは入金を訂正できる"
  on public.payments for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナーとスタッフは返金を参照できる"
  on public.refunds for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは返金を記録できる"
  on public.refunds for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは返金を訂正できる"
  on public.refunds for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));
