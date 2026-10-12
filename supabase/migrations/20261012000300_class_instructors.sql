-- =============================================================================
-- 047: クラスの担当講師を複数にする
--   設計書 4.2 の変更（2026-10-12）
--
-- これまで classes.instructor_id / lessons.instructor_id の1列で担当を
-- 持っていた。実際のスタジオでは、メインの先生とアシスタントの2人で
-- 回すクラスや、週2回の曜日ごとに先生が違うクラスがある。1人しか入らない
-- と、2人目は自分の画面にそのクラスが出ず、出欠も付けられない。
--
-- 考え方
--   class_instructors  … クラスの担当（設定）。運営が決める
--   lesson_instructors … その回の担当（実績）。生成時にクラスの担当を写す。
--                        あとで代講を入れるときは、この表の行を差し替える
--
-- ★ 1列の instructor_id は残さない。
--   残すと「列の先生」と「表の先生」の2つの真実ができ、画面ごとにどちらを
--   見るかがばらつく。移行時に表へ写してから列を落とす。
--
-- ★ class_instructors は物理削除しない（CLAUDE.md）。外した講師は
--   is_active = false にする。誰がいつまで担当していたかが残る。
--
-- ★ lesson_instructors は「生成した回」に付く派生データなので、レッスン本体
--   と同じ扱いにする。レッスンが作り直しで消えれば一緒に消え、担当を変えた
--   ときは「まだ予定のままの回」に限って作り直す。出欠を記録した回・実施済み
--   の回は触らない（その回を誰が担当したかは実績なので）。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 表
-- -----------------------------------------------------------------------------
create table public.class_instructors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  class_id         uuid not null,
  instructor_id    uuid not null,
  -- 並び順。先頭をメインの先生として表示する
  display_order    integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  foreign key (class_id, organization_id)
    references public.classes (id, organization_id) on delete restrict,
  foreign key (instructor_id, organization_id)
    references public.instructors (id, organization_id) on delete restrict,

  unique (class_id, instructor_id)
);

comment on table public.class_instructors is
  'クラスの担当講師。複数持てる。外した講師は is_active = false にして残す。';

create index class_instructors_class_idx
  on public.class_instructors (class_id) where is_active;
create index class_instructors_instructor_idx
  on public.class_instructors (instructor_id) where is_active;

create trigger class_instructors_set_updated_at
  before update on public.class_instructors
  for each row execute function app.set_updated_at();


create table public.lesson_instructors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  lesson_id        uuid not null,
  instructor_id    uuid not null,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),

  -- レッスンが作り直しで消えたら一緒に消える（派生データ）
  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete cascade,
  foreign key (instructor_id, organization_id)
    references public.instructors (id, organization_id) on delete restrict,

  unique (lesson_id, instructor_id)
);

comment on table public.lesson_instructors is
  'その回の担当講師。生成時にクラスの担当を写す。代講はこの表の行を差し替えて表す。';

create index lesson_instructors_lesson_idx
  on public.lesson_instructors (lesson_id);
create index lesson_instructors_instructor_idx
  on public.lesson_instructors (instructor_id);


-- -----------------------------------------------------------------------------
-- 2. 既存の担当を写す
-- -----------------------------------------------------------------------------
insert into public.class_instructors (organization_id, class_id, instructor_id)
select organization_id, id, instructor_id
from public.classes
where instructor_id is not null;

insert into public.lesson_instructors (organization_id, lesson_id, instructor_id)
select organization_id, id, instructor_id
from public.lessons
where instructor_id is not null;


-- -----------------------------------------------------------------------------
-- 3. 権限と RLS
--
-- 参照は所属者全員（保護者も担当の先生の名前は見える必要がある）。
-- 書き込みは下の関数と生成関数の中でだけ行う。authenticated に insert /
-- update を直接与えると、列を自由に書けてしまう。
-- -----------------------------------------------------------------------------
revoke all on table public.class_instructors  from anon;
revoke all on table public.lesson_instructors from anon;
grant select on table public.class_instructors  to authenticated;
grant select on table public.lesson_instructors to authenticated;
grant all on table public.class_instructors  to service_role;
grant all on table public.lesson_instructors to service_role;

alter table public.class_instructors  enable row level security;
alter table public.lesson_instructors enable row level security;

create policy "所属テナントのクラス担当を参照できる"
  on public.class_instructors for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "所属テナントのレッスン担当を参照できる"
  on public.lesson_instructors for select to authenticated
  using (organization_id in (select app.current_organization_ids()));


-- -----------------------------------------------------------------------------
-- 4. 担当の変更
--
-- 渡した講師を担当にし、渡さなかった講師を外す（is_active = false）。
-- まだ予定のままの回には、新しい担当をそのまま写す。
-- -----------------------------------------------------------------------------
create or replace function public.set_class_instructors(
  p_class_id       uuid,
  p_instructor_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c         public.classes%rowtype;
  v_ids     uuid[] := coalesce(p_instructor_ids, '{}');
  v_valid   integer;
  v_targets uuid[];
  v_synced  integer := 0;
begin
  select * into c from public.classes where id = p_class_id;
  if not found then
    raise exception 'class_not_found' using errcode = 'no_data_found';
  end if;

  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(c.organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- 別テナントの講師や、退職した講師は受け付けない
  select count(distinct i.id) into v_valid
  from public.instructors i
  where i.id = any (v_ids)
    and i.organization_id = c.organization_id
    and i.is_active;
  if v_valid <> cardinality(array(select distinct unnest(v_ids))) then
    raise exception 'instructor_not_found' using errcode = 'foreign_key_violation';
  end if;

  -- 渡された順を並び順にする。先頭がメインの先生
  insert into public.class_instructors (organization_id, class_id, instructor_id, display_order, is_active)
  select c.organization_id, c.id, x.id, x.ord - 1, true
  from unnest(v_ids) with ordinality as x(id, ord)
  on conflict (class_id, instructor_id) do update
    set is_active = true, display_order = excluded.display_order;

  update public.class_instructors
  set is_active = false
  where class_id = c.id
    and is_active
    and not (instructor_id = any (v_ids));

  -- まだ予定のままの回に写す。出欠を記録した回・実施済み・休講の回は、
  -- その回を誰が担当したかの実績なので触らない。
  -- 「今日」は JST で数える（設計書 2.1）
  select array_agg(l.id) into v_targets
  from public.lessons l
  where l.class_id = c.id
    and l.status = 'scheduled'
    and l.has_attendance_record = false
    and l.date >= (now() at time zone 'Asia/Tokyo')::date;

  v_targets := coalesce(v_targets, '{}');
  v_synced  := cardinality(v_targets);

  -- 消してから入れる。同じ文に並べると、同じ (lesson_id, instructor_id) を
  -- 消しつつ入れることになり、一意制約に当たる
  delete from public.lesson_instructors
  where lesson_id = any (v_targets);

  insert into public.lesson_instructors (organization_id, lesson_id, instructor_id, display_order)
  select c.organization_id, t.id, ci.instructor_id, ci.display_order
  from unnest(v_targets) as t(id)
  cross join public.class_instructors ci
  where ci.class_id = c.id and ci.is_active;

  return v_synced;
end;
$fn$;

comment on function public.set_class_instructors(uuid, uuid[]) is
  'クラスの担当講師を入れ替える。渡さなかった講師は is_active = false。'
  'まだ予定のままの回には新しい担当を写し、その回数を返す。';

revoke all on function public.set_class_instructors(uuid, uuid[]) from public, anon;
grant execute on function public.set_class_instructors(uuid, uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. クラスの登録（移行 020 の置き換え）
--    担当講師を配列で受け取る。古い署名は落とす
-- -----------------------------------------------------------------------------
drop function if exists public.create_class(uuid, uuid, text, jsonb, text, text, uuid, integer, integer, integer);

create or replace function public.create_class(
  p_organization_id     uuid,
  p_season_id           uuid,
  p_name                text,
  p_meetings            jsonb,
  p_genre               text    default null,
  p_level               text    default null,
  p_instructor_ids      uuid[]  default null,
  p_enrollment_capacity integer default null,
  p_room_capacity       integer default null,
  p_monthly_fee         integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class_id uuid;
begin
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_meetings is null or jsonb_array_length(p_meetings) = 0 then
    raise exception 'meetings_required' using errcode = 'check_violation';
  end if;

  insert into public.classes (
    organization_id, season_id,
    name, genre, level,
    enrollment_capacity, room_capacity, monthly_fee
  )
  values (
    p_organization_id, p_season_id,
    p_name, p_genre, p_level,
    p_enrollment_capacity, p_room_capacity, coalesce(p_monthly_fee, 0)
  )
  returning id into v_class_id;

  -- 部屋が別テナントのものなら、複合外部キー (room_id, organization_id) で弾かれる
  insert into public.class_meetings (
    organization_id, class_id, room_id, day_of_week, start_time, end_time
  )
  select
    p_organization_id,
    v_class_id,
    (m ->> 'room_id')::uuid,
    (m ->> 'day_of_week')::integer,
    (m ->> 'start_time')::time,
    (m ->> 'end_time')::time
  from jsonb_array_elements(p_meetings) as m;

  -- 講師の所属確認は set_class_instructors の中で行う
  if p_instructor_ids is not null and cardinality(p_instructor_ids) > 0 then
    perform public.set_class_instructors(v_class_id, p_instructor_ids);
  end if;

  return v_class_id;
end;
$fn$;

comment on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid[], integer, integer, integer) is
  'クラスと開催枠と担当講師を同じトランザクションで作る（設計書 4.2）。'
  '開催日の無いクラスを残さないため。';

revoke all on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid[], integer, integer, integer)
  from public, anon;
grant execute on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid[], integer, integer, integer)
  to authenticated;


-- -----------------------------------------------------------------------------
-- 6. レッスンの一括生成（移行 021 の置き換え）
--    作った回に、クラスの担当講師を写す。それ以外は 021 と同じ
-- -----------------------------------------------------------------------------
create or replace function public.generate_lessons(target_class_id uuid)
returns table (
  created          integer,
  removed          integer,
  kept_attendance  integer,
  skipped_closures integer
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c          public.classes%rowtype;
  s          public.seasons%rowtype;
  m          public.class_meetings%rowtype;
  v_location uuid;
  v_created  integer := 0;
  v_removed  integer := 0;
  v_kept     integer := 0;
  v_skipped  integer := 0;
  v_add      integer;
begin
  select * into c from public.classes where id = target_class_id;
  if not found then
    raise exception 'class_not_found' using errcode = 'no_data_found';
  end if;

  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(c.organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into s from public.seasons where id = c.season_id;

  -- 触らずに残した回を数える。出欠だけでなく、欠席連絡・振替・キャンセル待ちが
  -- 付いている回も残す
  select count(*) into v_kept
  from public.lessons l
  where l.class_id = c.id
    and (l.has_attendance_record or public.lesson_is_referenced(l.id));

  -- 作り直しの対象は「誰も触っていない、まだ予定のままの回」だけ。
  -- 実施済み・休講にした回も、運営の判断が入っているので残す。
  -- lesson_instructors は外部キーの cascade で一緒に消える
  with removed_rows as (
    delete from public.lessons l
    where l.class_id = c.id
      and l.has_attendance_record = false
      and l.status = 'scheduled'
      and not public.lesson_is_referenced(l.id)
    returning 1
  )
  select count(*) into v_removed from removed_rows;

  -- 開催枠ごとに生成する。週2回のクラスなら2周する
  for m in
    select * from public.class_meetings
    where class_id = c.id and is_active
    order by day_of_week, start_time
  loop
    -- 休講日は校舎単位で指定できるので、この部屋がどの校舎かを引く
    select location_id into v_location from public.rooms where id = m.room_id;

    -- 休講で除外される日数を数える
    with target_days as (
      select g::date as day
      from generate_series(s.start_date, s.end_date, interval '1 day') as g
      where extract(dow from g) = m.day_of_week
    )
    select count(*) into v_add
    from target_days t
    where exists (
      select 1 from public.studio_closures sc
      where sc.organization_id = c.organization_id
        and sc.date = t.day
        and (sc.location_id is null or sc.location_id = v_location)
    );
    v_skipped := v_skipped + v_add;

    -- 休講日を除いて生成し、作った回にクラスの担当講師を写す。
    -- 日付と時刻から timestamptz を作るときは必ず Asia/Tokyo で解釈する（設計書 2.1）
    with target_days as (
      select g::date as day
      from generate_series(s.start_date, s.end_date, interval '1 day') as g
      where extract(dow from g) = m.day_of_week
    ),
    inserted as (
      insert into public.lessons (
        organization_id, class_id, class_meeting_id, room_id,
        date, start_at, end_at
      )
      select
        c.organization_id, c.id, m.id, m.room_id,
        t.day,
        (t.day + m.start_time) at time zone 'Asia/Tokyo',
        (t.day + m.end_time)   at time zone 'Asia/Tokyo'
      from target_days t
      where not exists (
        select 1 from public.studio_closures sc
        where sc.organization_id = c.organization_id
          and sc.date = t.day
          and (sc.location_id is null or sc.location_id = v_location)
      )
      -- 残した回と同じ日付・同じ開始時刻なら、ここで弾かれる
      on conflict (class_id, date, start_at) do nothing
      returning id
    ),
    assigned as (
      insert into public.lesson_instructors (organization_id, lesson_id, instructor_id, display_order)
      select c.organization_id, i.id, ci.instructor_id, ci.display_order
      from inserted i
      cross join public.class_instructors ci
      where ci.class_id = c.id and ci.is_active
      returning 1
    )
    select count(*) into v_add from inserted;
    v_created := v_created + v_add;
  end loop;

  return query select v_created, v_removed, v_kept, v_skipped;
end;
$fn$;

comment on function public.generate_lessons(uuid) is
  '期の期間から、クラスの開催枠ごとにレッスンを一括生成し、担当講師を写す（設計書 5.1）。'
  '出欠・欠席連絡・振替・キャンセル待ちが付いた回と、実施済み・休講にした回は'
  '作り直しの対象から外す。';


-- -----------------------------------------------------------------------------
-- 7. 1列の担当を落とす（表へ写し終えてから）
-- -----------------------------------------------------------------------------
alter table public.classes drop column instructor_id;
alter table public.lessons drop column instructor_id;

-- PostgREST に表の変更を知らせる
notify pgrst, 'reload schema';
