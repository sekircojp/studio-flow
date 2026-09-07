-- =============================================================================
-- 038: 発表会・イベントと、その出欠
--   設計書 4.6（events / event_entries）
--
-- 設計書 9.1 では「発表会・衣装管理」を対象外としていたが、出欠を取る部分は
-- 運営から先に必要になったため、そこだけをフェーズ1に入れる。演目・衣装・
-- 発注・チケットには手を付けない（設計書 10章の将来拡張のまま）。
--
-- ★ 発表会もイベントも同じテーブルにする。
--   名簿の作り方も出欠の取り方も同じで、分けると同じ画面を2つ作ることに
--   なる。違いは呼び名だけなので kind で持つ。
--
-- ★ 会場は自由入力にして、locations には紐づけない。
--   発表会は市民ホールなど、普段のスタジオ以外で開かれるのが普通。
--   locations に紐づけると、1回きりの会場をスタジオとして登録することになり、
--   クラスやレッスンの選択肢にまで出てきてしまう。
--
-- ★ 「参加するか」と「当日来たか」を別の列で持つ。
--   レッスンで lessons.status と attendances.status を分けているのと同じ。
--   1つの列にすると「出ると言っていたのに来なかった」が表せない。
--   衣装や立ち位置を用意する発表会では、この区別が実務上いちばん重要になる。
--
-- ★ 物理削除はしない（CLAUDE.md）。中止は status = 'canceled' で表す。
-- =============================================================================

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- recital 発表会 / event その他のイベント（合宿・ワークショップなど）
  kind            text not null default 'event'
                    check (kind in ('recital', 'event')),

  title           text not null,
  -- 会場。自由入力（上のコメントを参照）
  venue           text,

  start_at        timestamptz not null,
  end_at          timestamptz,

  -- 出演者・参加者の上限。未設定なら上限なし
  capacity        integer check (capacity is null or capacity > 0),

  -- 参加費（税込・整数の円。設計書 2.2）。
  -- 請求とはまだ繋がない。載せるときは invoice_items.kind = 'event' を使う
  price           integer check (price is null or price >= 0),

  -- planned 予定 / held 開催済み / canceled 中止
  status          text not null default 'planned'
                    check (status in ('planned', 'held', 'canceled')),
  cancel_reason   text,

  -- 保護者のマイページに出して、出欠を答えてもらうか
  is_public       boolean not null default true,

  description     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id)
);

comment on table public.events is
  '発表会・イベント（設計書 4.6）。出欠を取るところまでを扱う。';
comment on column public.events.venue is
  '会場。locations には紐づけない。発表会は普段のスタジオ以外で開かれるため。';
comment on column public.events.is_public is
  '真なら保護者のマイページに出て、保護者が出欠を答えられる。';

create index events_org_start_idx
  on public.events (organization_id, start_at desc);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function app.set_updated_at();


create table public.event_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id        uuid not null,
  student_id      uuid not null,

  -- 参加の意思
  --   invited  声をかけた（まだ返事がない）
  --   entered  参加する
  --   declined 参加しない
  --   canceled 参加を取り消した
  status          text not null default 'invited'
                    check (status in ('invited', 'entered', 'declined', 'canceled')),

  -- 誰がいつ答えたか。保護者が自分で答えた場合と、運営が聞き取って入れた場合を
  -- 区別する。「まだ答えていない」と「答えたうえで不参加」の取り違えを防ぐ
  answered_at     timestamptz,
  answered_by     uuid references auth.users (id) on delete set null,

  -- 当日の出欠。attendances と同じ語を使う
  attendance      text not null default 'unconfirmed'
                    check (attendance in ('present', 'absent', 'late', 'unconfirmed')),
  attendance_recorded_by uuid references auth.users (id) on delete set null,
  attendance_recorded_at timestamptz,

  -- この生徒に請求する金額（税込・整数の円）。events.price から複写し、
  -- 個別の免除を許す。請求とはまだ繋がない
  amount          integer check (amount is null or amount >= 0),

  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (event_id, organization_id)
    references public.events (id, organization_id) on delete cascade,
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,

  -- 同じイベントの同じ生徒は1行だけ
  unique (event_id, student_id)
);

comment on table public.event_entries is
  '発表会・イベントの名簿（設計書 4.6）。参加の意思と当日の出欠を別の列で持つ。';
comment on column public.event_entries.status is
  'invited 声をかけた / entered 参加する / declined 参加しない / canceled 取り消し。';
comment on column public.event_entries.attendance is
  '当日の出欠。attendances.status と同じ語。unconfirmed は「まだ誰も記録していない」。';

create index event_entries_event_idx on public.event_entries (event_id);
create index event_entries_student_idx on public.event_entries (student_id);
create index event_entries_org_idx on public.event_entries (organization_id);

create trigger event_entries_set_updated_at
  before update on public.event_entries
  for each row execute function app.set_updated_at();


-- -----------------------------------------------------------------------------
-- 保護者が自分の子どもの参加可否を答える
--
-- ★ 保護者に update 権限そのものを渡さない。
--   RLS は行単位で、列単位の出し分けができない。行を更新させると、
--   当日の出欠（attendance）まで書き換えられる。答えられるのは status
--   だけなので、この関数の中でだけ触れるようにする。
-- -----------------------------------------------------------------------------
create or replace function public.answer_event_entry(
  p_entry_id uuid,
  p_going    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  e public.event_entries%rowtype;
  v public.events%rowtype;
begin
  select * into e from public.event_entries where id = p_entry_id;
  if not found then
    raise exception 'entry_not_found' using errcode = 'no_data_found';
  end if;

  -- 自分の世帯の生徒か。画面を迂回して呼ばれても、他人の子どもは答えられない
  if e.student_id not in (select app.current_student_ids()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v from public.events where id = e.event_id;
  if v.status <> 'planned' then
    raise exception 'event_closed' using errcode = 'check_violation';
  end if;
  if not v.is_public then
    raise exception 'event_not_public' using errcode = 'check_violation';
  end if;

  -- 開催が過ぎたら答えられない。過ぎた回の返事は運営が聞き取って入れる
  if v.start_at < now() then
    raise exception 'event_past' using errcode = 'check_violation';
  end if;

  update public.event_entries
  set status      = case when p_going then 'entered' else 'declined' end,
      answered_at = now(),
      answered_by = (select auth.uid())
  where id = p_entry_id;
end;
$fn$;

comment on function public.answer_event_entry(uuid, boolean) is
  '保護者が自分の子どもの参加可否を答える（設計書 4.6）。'
  '触れるのは status だけ。当日の出欠は運営・講師しか記録できない。';

revoke all on function public.answer_event_entry(uuid, boolean) from public, anon;
grant execute on function public.answer_event_entry(uuid, boolean) to authenticated;


-- =============================================================================
-- 権限と RLS（設計書 3章）
-- =============================================================================
revoke all on table public.events        from anon;
revoke all on table public.event_entries from anon;

grant select, insert, update on table public.events        to authenticated;
grant select, insert, update on table public.event_entries to authenticated;

grant all on table public.events        to service_role;
grant all on table public.event_entries to service_role;

alter table public.events        enable row level security;
alter table public.event_entries enable row level security;


-- -----------------------------------------------------------------------------
-- events
--
-- 講師は当日の出欠を取るので、イベントそのものは見える必要がある。
-- 保護者には公開したものだけを見せる。
-- -----------------------------------------------------------------------------
create policy "運営と講師は全イベントを、保護者は公開されたものを参照できる"
  on public.events for select to authenticated
  using (
    organization_id in (select app.current_organization_ids())
    and (
      app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
      or is_public
    )
  );

create policy "オーナーとスタッフはイベントを登録できる"
  on public.events for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフはイベントを更新できる"
  on public.events for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- -----------------------------------------------------------------------------
-- event_entries
--
-- 保護者は自分の子どもの行だけ見える。更新は answer_event_entry() を通す
-- （上のコメントを参照）ので、update のポリシーは運営と講師にだけ与える。
-- -----------------------------------------------------------------------------
create policy "運営と講師、および本人の世帯は名簿を参照できる"
  on public.event_entries for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは名簿に追加できる"
  on public.event_entries for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナー・スタッフ・講師は名簿を更新できる"
  on public.event_entries for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']))
  with check (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']));
