-- =============================================================================
-- 016: 請求の訂正・取消の制御と監査ログ
--   設計書 4.9（audit_logs）/ 5.6（請求の訂正・取消）に対応
--
-- 設計書 5.6 の表
--   draft（未送付）        自由に編集
--   issued（送付済・未入金）編集可。変更履歴を audit_logs に記録
--   paid（入金済）          編集不可。取消＋返金記録で対応
--
-- ★ 設計書 13章の完了確認「入金済みの請求が編集できない」に対応する。
--   画面に編集手段を出さないだけでは不十分。RLS は「どの行を触れるか」しか
--   見ないので、直接 API を叩けば金額を書き換えられてしまう。
--   DB 側のトリガで止める。
-- =============================================================================

-- =============================================================================
-- audit_logs: 監査ログ（設計書 4.9）
-- =============================================================================
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- 誰が。トリガや定期実行からの変更では null になる
  actor_id        uuid references auth.users (id) on delete set null,

  action          text not null,
  target_type     text not null,
  target_id       uuid,

  before          jsonb,
  after           jsonb,

  created_at      timestamptz not null default now()
);

comment on table public.audit_logs is '監査ログ。請求の訂正など、あとから経緯を追う必要がある操作を残す（設計書 4.9 / 5.6）。';
comment on column public.audit_logs.actor_id is '操作した利用者。トリガや定期実行からの変更では null。';

create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- 参照はオーナーのみ。スタッフには見せない（誰が何を直したかの記録のため）
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

create policy "オーナーは監査ログを参照できる"
  on public.audit_logs for select to authenticated
  using (app.has_org_role(organization_id, array['owner']));

-- insert は与えない。書き込むのはトリガ（security definer）だけ


-- =============================================================================
-- 入金済み請求の編集を止める
--
-- 許すのは取消（canceled）への遷移と、その理由の記録だけ。
-- 金額・請求月・対象生徒は変えさせない。
--
-- 入金トリガ（app.sync_invoice_payment_status）が status を書き換えるので、
-- status 自体の変更は妨げないようにする。
-- =============================================================================
create or replace function app.guard_paid_invoice()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.status <> 'paid' then
    return new;
  end if;

  -- 取消は認める（設計書 5.6: 取消＋返金記録で対応）
  if new.status = 'canceled' then
    return new;
  end if;

  if new.subtotal       is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.total          is distinct from old.total
     or new.tax_rate       is distinct from old.tax_rate
     or new.tax_amount     is distinct from old.tax_amount
     or new.billing_month  is distinct from old.billing_month
     or new.student_id     is distinct from old.student_id
     or new.due_date       is distinct from old.due_date
  then
    raise exception 'paid_invoice_is_immutable'
      using errcode = 'restrict_violation',
            hint = '入金済みの請求は編集できません。取消してから作り直してください。';
  end if;

  return new;
end;
$fn$;

create trigger invoices_guard_paid
  before update on public.invoices
  for each row execute function app.guard_paid_invoice();


-- 明細も同じ。入金済みの請求にぶら下がる行は触らせない
create or replace function app.guard_paid_invoice_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  select status into v_status
  from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  if v_status = 'paid' then
    raise exception 'paid_invoice_is_immutable'
      using errcode = 'restrict_violation',
            hint = '入金済みの請求の明細は編集できません。';
  end if;

  return coalesce(new, old);
end;
$fn$;

create trigger invoice_items_guard_paid
  before insert or update or delete on public.invoice_items
  for each row execute function app.guard_paid_invoice_items();


-- =============================================================================
-- 送付済み（issued）の請求を直したら、変更履歴を残す（設計書 5.6）
--
-- 金額に関わる列が変わったときだけ記録する。status の遷移だけで
-- 毎回積むと、入金のたびにログが増えて肝心の訂正が埋もれる。
-- =============================================================================
create or replace function app.log_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.status not in ('issued', 'partially_paid') then
    return new;
  end if;

  if new.subtotal       is not distinct from old.subtotal
     and new.discount_total is not distinct from old.discount_total
     and new.total          is not distinct from old.total
     and new.tax_amount     is not distinct from old.tax_amount
     and new.due_date       is not distinct from old.due_date
  then
    return new;
  end if;

  insert into public.audit_logs (
    organization_id, actor_id, action, target_type, target_id, before, after
  )
  values (
    old.organization_id,
    (select auth.uid()),
    'invoice.updated',
    'invoice',
    old.id,
    jsonb_build_object(
      'subtotal', old.subtotal, 'discount_total', old.discount_total,
      'total', old.total, 'tax_amount', old.tax_amount, 'due_date', old.due_date
    ),
    jsonb_build_object(
      'subtotal', new.subtotal, 'discount_total', new.discount_total,
      'total', new.total, 'tax_amount', new.tax_amount, 'due_date', new.due_date
    )
  );

  return new;
end;
$fn$;

create trigger invoices_log_change
  after update on public.invoices
  for each row execute function app.log_invoice_change();


-- 取消も残す。理由が入るので、あとから経緯を追える
create or replace function app.log_invoice_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'canceled' and old.status <> 'canceled' then
    insert into public.audit_logs (
      organization_id, actor_id, action, target_type, target_id, before, after
    )
    values (
      old.organization_id,
      (select auth.uid()),
      'invoice.canceled',
      'invoice',
      old.id,
      jsonb_build_object('status', old.status, 'total', old.total),
      jsonb_build_object('status', new.status, 'reason', new.cancel_reason)
    );
  end if;
  return new;
end;
$fn$;

create trigger invoices_log_cancel
  after update on public.invoices
  for each row execute function app.log_invoice_cancel();
