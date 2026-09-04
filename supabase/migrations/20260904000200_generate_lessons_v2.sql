-- =============================================================================
-- 019: レッスンの一括生成（開催枠に対応）
--   設計書 5.1 に対応。018 でクラスと開催枠を分けたことによる書き換え。
--
--   入力: class_id
--   処理:
--     1. その期の start_date 〜 end_date を走査
--     2. クラスの開催枠（有効なもの）ごとに、その曜日に一致する日を抽出
--     3. studio_closures に該当する日を除外
--     4. lessons を生成（status = scheduled）
--   出力: 生成件数、作り直しで消した件数、出欠済みで残した件数、休講で除いた件数
--
-- ★ 再生成の禁止ルール（設計書 5.1・最重要）
--   has_attendance_record = true のレッスンは、再生成・一括削除の対象から
--   必ず除外する。曜日を変えて作り直したときに、出欠を記録した回が消えることを
--   防ぐ。実施済み・休講にした回も、運営の判断が入っているので残す。
--
-- 削除と生成を1つの関数にまとめているのは、同じトランザクションで行うため。
-- 途中で失敗したときに「消えただけ」の状態を残さない。
--
-- 一時テーブルは使わない。Supabase は WHERE 句の無い DELETE を拒否する設定に
-- なっており（事故防止）、一時テーブルの掃除で引っかかるため。
-- =============================================================================

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

  -- 出欠が付いている回は数えるだけで、触らない
  select count(*) into v_kept
  from public.lessons
  where class_id = c.id and has_attendance_record;

  -- 作り直しの対象は「出欠が無く、まだ予定のままの回」だけ。
  -- 枠を止めた場合も、ここで消えて作り直されないだけになる
  with removed_rows as (
    delete from public.lessons
    where class_id = c.id
      and has_attendance_record = false
      and status = 'scheduled'
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
    -- 日付と時刻から timestamptz を作るときは必ず Asia/Tokyo で解釈する（設計書 2.1）。
    -- ここを取り違えると、16時のレッスンが別の時刻として保存される
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
      -- 出欠済み・実施済み・休講で残した回と重なる場合は、ここで弾かれる
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
  '出欠が記録された回と、実施済み・休講にした回は作り直しの対象から外す。';

revoke all on function public.generate_lessons(uuid) from public, anon;
grant execute on function public.generate_lessons(uuid) to authenticated;
