-- =============================================================================
-- 040: イベント参加費を月謝の請求に載せる
--   設計書 4.5 / 4.6.3
--
-- 参加費の集め方（移行 039）で「翌月の月謝と一緒に集める」を選んだとき、
-- どの月の請求に載せるかをイベント側で持ち、実際に明細として入れる。
--
-- ★ 何月に載せるかはイベントごとに決める。
--   発表会は10月に案内して11月開催、集金は12月、という具合にずれる。
--   開催月から機械的に決めると実態と合わない。
--
-- ★ 載せるのは「参加する」と答えた生徒だけ。
--   保留・不参加・未回答・取消には請求しない。
--
-- ★ 金額は event_entries.amount を使う。
--   events.price から複写してあり、個別の免除ができる（移行 038）。
--
-- ★ 同じ参加を二度請求しない。
--   invoice_items に event_entry_id を持たせ、部分一意索引で担保する。
--   請求を作り直しても、明細が重複しない。
--
-- ★ 入金済みの請求には足さない。
--   設計書 5.6 のとおり paid は編集不可。取消＋返金で対応する領域なので、
--   ここでは黙って飛ばし、件数を返して画面に出す。
-- =============================================================================

alter table public.events
  -- fee_collection = 'with_tuition' のときだけ使う。月初日で持つ
  add column billing_month date
    check (billing_month is null or billing_month = date_trunc('month', billing_month)::date);

comment on column public.events.billing_month is
  '参加費を合算する対象月（月初日）。fee_collection = with_tuition のときだけ使う。';


alter table public.invoice_items
  add column event_entry_id uuid,
  add constraint invoice_items_event_entry_id_organization_id_fkey
    foreign key (event_entry_id, organization_id)
    references public.event_entries (id, organization_id) on delete cascade;

comment on column public.invoice_items.event_entry_id is
  'イベント参加費の明細（設計書 4.6.3）。同じ参加を二度請求しないための鍵。';

-- 同じ参加は1回しか請求しない
create unique index invoice_items_once_per_event_entry
  on public.invoice_items (event_entry_id)
  where event_entry_id is not null;


-- -----------------------------------------------------------------------------
-- 対象月の請求に、イベント参加費の明細を足す
--
-- 戻り値
--   added   足した明細の件数
--   skipped 足せなかった件数（請求が無い / 入金済み / すでに載っている）
--
-- 請求の合計はこの関数の中で計算し直す。明細だけ足して合計が古いままだと、
-- 帳票と請求額が食い違う。
-- -----------------------------------------------------------------------------
create or replace function app.apply_event_fees(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (added integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_month   date := date_trunc('month', p_billing_month)::date;
  v_added   integer := 0;
  v_skipped integer := 0;
  r         record;
begin
  for r in
    select
      ee.id        as entry_id,
      ee.amount    as amount,
      ev.title     as title,
      i.id         as invoice_id,
      i.status     as invoice_status
    from public.event_entries ee
    join public.events ev
      on ev.id = ee.event_id and ev.organization_id = ee.organization_id
    left join public.invoices i
      on i.student_id = ee.student_id
     and i.organization_id = ee.organization_id
     and i.billing_month = v_month
    where ee.organization_id = p_organization_id
      and ee.status = 'entered'
      and ev.status <> 'canceled'
      and ev.fee_collection = 'with_tuition'
      and ev.billing_month = v_month
      and coalesce(ee.amount, 0) > 0
      -- すでに載っているものは対象外
      and not exists (
        select 1 from public.invoice_items it
        where it.event_entry_id = ee.id
      )
  loop
    -- 請求が無い（月謝契約がない生徒）／入金済み・取消は足せない
    if r.invoice_id is null
       or r.invoice_status in ('paid', 'canceled', 'partially_paid') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.invoice_items (
      organization_id, invoice_id, kind, description, amount, event_entry_id
    )
    values (
      p_organization_id, r.invoice_id, 'event',
      r.title || ' 参加費', r.amount, r.entry_id
    );

    v_added := v_added + 1;
  end loop;

  -- 足したぶんを合計に反映する。subtotal は明細のプラス分の合計に揃える
  -- （subtotal - discount_total = total を崩さないため）
  if v_added > 0 then
    update public.invoices i
    set
      subtotal       = d.positive,
      discount_total = d.discount_total,
      total          = d.gross,
      tax_amount     = app.tax_from_gross(d.gross, i.tax_rate)
    from (
      select
        it.invoice_id,
        sum(case when it.amount > 0 then it.amount else 0 end)::integer as positive,
        sum(case when it.amount < 0 then -it.amount else 0 end)::integer as discount_total,
        greatest(sum(it.amount), 0)::integer as gross
      from public.invoice_items it
      join public.invoices iv on iv.id = it.invoice_id
      where iv.organization_id = p_organization_id
        and iv.billing_month = v_month
        and iv.status in ('draft', 'issued')
      group by it.invoice_id
    ) d
    where i.id = d.invoice_id
      and i.organization_id = p_organization_id;
  end if;

  return query select v_added, v_skipped;
end;
$fn$;

comment on function app.apply_event_fees(uuid, date) is
  'イベント参加費を対象月の請求に明細として足す（設計書 4.6.3）。'
  '入金済みの請求には足さない。';


-- 画面から呼ぶ入口。オーナー・スタッフだけ
create or replace function public.apply_event_fees(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (added integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  return query select * from app.apply_event_fees(p_organization_id, p_billing_month);
end;
$fn$;

revoke all on function public.apply_event_fees(uuid, date) from public, anon;
grant execute on function public.apply_event_fees(uuid, date) to authenticated;


-- -----------------------------------------------------------------------------
-- 月次生成の中でも、同じ月のイベント参加費を載せる
--
-- 生成した直後に足すことで、請求を作る時点で金額が確定する。あとから足すと
-- 「お知らせメールに書いた金額」と「実際の請求額」が食い違う。
--
-- ★ 兄弟割は月謝だけを対象にする。
--   割引の順位づけは invoices.subtotal（月謝）で行い、参加費を足すのは
--   そのあと。参加費の多い子から割り引かれる、といったことが起きない。
-- -----------------------------------------------------------------------------
create or replace function app.generate_invoices_internal(
  p_organization_id uuid,
  p_billing_month   date
)
returns table (created integer, skipped_existing integer, discounted integer, total_amount bigint)
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

  -- 兄弟割（設計書 5.5）。順位づけは月謝（subtotal）で行う
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

  -- イベント参加費（設計書 4.6.3）。兄弟割のあとに足す
  perform app.apply_event_fees(p_organization_id, v_month);

  update public.invoices i
  set
    subtotal       = d.positive,
    discount_total = d.discount_total,
    total          = d.gross,
    tax_amount     = app.tax_from_gross(d.gross, i.tax_rate),
    status         = 'issued',
    issued_at      = now()
  from (
    select
      it.invoice_id,
      sum(case when it.amount > 0 then it.amount else 0 end)::integer as positive,
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

revoke all on function app.generate_invoices_internal(uuid, date)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- イベントごとの、参加費の請求状況
--
-- 画面に「何人ぶん請求済みか」を出すために使う。
-- -----------------------------------------------------------------------------
create or replace function public.event_fee_status(p_event_id uuid)
returns table (billable integer, billed integer)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    count(*) filter (
      where ee.status = 'entered' and coalesce(ee.amount, 0) > 0
    )::integer as billable,
    count(*) filter (
      where exists (
        select 1 from public.invoice_items it where it.event_entry_id = ee.id
      )
    )::integer as billed
  from public.event_entries ee
  join public.events ev on ev.id = ee.event_id
  where ee.event_id = p_event_id
    and ev.organization_id in (select app.current_organization_ids());
$fn$;

comment on function public.event_fee_status(uuid) is
  'イベント参加費の請求状況（設計書 4.6.3）。請求対象と請求済みの人数。';

grant execute on function public.event_fee_status(uuid) to authenticated;
