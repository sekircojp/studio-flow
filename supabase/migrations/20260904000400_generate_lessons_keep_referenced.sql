-- =============================================================================
-- 021: レッスンの作り直しで、他から参照されている回を残す
--   設計書 5.1 の補強
--
-- これまで「出欠が無く、まだ予定のままの回」は無条件に消していた。しかし
-- レッスンは出欠以外からも参照される。
--
--   absence_requests  … 欠席連絡
--   transfer_bookings … 振替の予約（この回に振り替えて出る）
--   transfer_credits  … 振替権の発生元（この回を休んだ）
--   waitlists         … キャンセル待ち
--
-- 振替予約の入っている回を消そうとすると外部キーに阻まれ、関数全体が失敗して
-- 「レッスンを生成できませんでした」になっていた。振替の予約が1件でもあれば
-- 曜日の変更が一切できない状態だったので、実運用に入る前に直す。
--
-- そもそも、これらの回には運営や保護者の操作が乗っている。出欠を記録した回と
-- 同じく、作り直しでは触らないのが正しい（設計書 5.1 の趣旨）。
-- =============================================================================

-- 出欠以外の参照があるか。ここに挙げたテーブルはすべて lessons への
-- 外部キーを持っているので、参照が残っている行は削除できない
create or replace function public.lesson_is_referenced(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    exists (select 1 from public.absence_requests  where lesson_id = p_lesson_id)
    or exists (select 1 from public.transfer_bookings where lesson_id = p_lesson_id)
    or exists (select 1 from public.transfer_credits  where source_lesson_id = p_lesson_id)
    or exists (select 1 from public.waitlists         where lesson_id = p_lesson_id);
$fn$;

comment on function public.lesson_is_referenced(uuid) is
  'そのレッスンに欠席連絡・振替・キャンセル待ちが付いているか。'
  'レッスンの作り直しで消してよいかの判定に使う（設計書 5.1）。';

revoke all on function public.lesson_is_referenced(uuid) from public, anon;
grant execute on function public.lesson_is_referenced(uuid) to authenticated;


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
  -- 実施済み・休講にした回も、運営の判断が入っているので残す
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

    -- 休講日を除いて生成する。
    -- 日付と時刻から timestamptz を作るときは必ず Asia/Tokyo で解釈する（設計書 2.1）
    with target_days as (
      select g::date as day
      from generate_series(s.start_date, s.end_date, interval '1 day') as g
      where extract(dow from g) = m.day_of_week
    ),
    inserted as (
      insert into public.lessons (
        organization_id, class_id, class_meeting_id, room_id, instructor_id,
        date, start_at, end_at
      )
      select
        c.organization_id, c.id, m.id, m.room_id, c.instructor_id,
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
      returning 1
    )
    select count(*) into v_add from inserted;
    v_created := v_created + v_add;
  end loop;

  return query select v_created, v_removed, v_kept, v_skipped;
end;
$fn$;

comment on function public.generate_lessons(uuid) is
  '期の期間から、クラスの開催枠ごとにレッスンを一括生成する（設計書 5.1）。'
  '出欠・欠席連絡・振替・キャンセル待ちが付いた回と、実施済み・休講にした回は'
  '作り直しの対象から外す。';

revoke all on function public.generate_lessons(uuid) from public, anon;
grant execute on function public.generate_lessons(uuid) to authenticated;
