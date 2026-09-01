-- =============================================================================
-- 009: レッスンの一括生成
--   設計書 5.1 に対応
--
--   入力: class_id
--   処理:
--     1. その期の start_date 〜 end_date を走査
--     2. クラスの day_of_week に一致する日を抽出
--     3. studio_closures に該当する日を除外
--     4. lessons を生成（status = scheduled）
--   出力: 生成件数、休講で除外した件数、出欠済みで残した件数
--
-- ★ 再生成の禁止ルール（設計書 5.1・最重要）
--   has_attendance_record = true のレッスンは、再生成・一括削除の対象から
--   必ず除外する。クラスの曜日を変更して作り直したときに、出欠を記録した回が
--   消えることを防ぐ。
--
-- 1つの関数にまとめているのは、削除と生成を同じトランザクションで行うため。
-- 途中で失敗したときに「消えただけ」の状態を残さない。
--
-- 一時テーブルは使わない。Supabase は WHERE 句の無い DELETE を拒否する設定に
-- なっており（事故防止）、一時テーブルの掃除で引っかかるため。
-- 対象日は CTE で組み立てる。
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
  v_location uuid;
  v_created  integer := 0;
  v_removed  integer := 0;
  v_kept     integer := 0;
  v_skipped  integer := 0;
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

  -- 休講日は校舎単位で指定できるので、この部屋がどの校舎かを引く
  select location_id into v_location from public.rooms where id = c.room_id;

  -- 出欠が付いている回は数えるだけで、触らない
  select count(*) into v_kept
  from public.lessons
  where class_id = c.id and has_attendance_record;

  -- 作り直しの対象は「出欠が無く、まだ予定のままの回」だけ。
  -- 実施済み・休講にした回も、運営の判断が入っているので残す
  with removed_rows as (
    delete from public.lessons
    where class_id = c.id
      and has_attendance_record = false
      and status = 'scheduled'
    returning 1
  )
  select count(*) into v_removed from removed_rows;

  -- 休講で除外される日数を数える
  with target_days as (
    select g::date as day
    from generate_series(s.start_date, s.end_date, interval '1 day') as g
    where extract(dow from g) = c.day_of_week
  )
  select count(*) into v_skipped
  from target_days t
  where exists (
    select 1 from public.studio_closures sc
    where sc.organization_id = c.organization_id
      and sc.date = t.day
      and (sc.location_id is null or sc.location_id = v_location)
  );

  -- 休講日を除いて生成する。
  -- 日付と時刻から timestamptz を作るときは必ず Asia/Tokyo で解釈する（設計書 2.1）。
  -- ここを取り違えると、16時のレッスンが別の時刻として保存される
  with target_days as (
    select g::date as day
    from generate_series(s.start_date, s.end_date, interval '1 day') as g
    where extract(dow from g) = c.day_of_week
  ),
  inserted as (
    insert into public.lessons (
      organization_id, class_id, room_id, instructor_id,
      date, start_at, end_at
    )
    select
      c.organization_id, c.id, c.room_id, c.instructor_id,
      t.day,
      (t.day + c.start_time) at time zone 'Asia/Tokyo',
      (t.day + c.end_time)   at time zone 'Asia/Tokyo'
    from target_days t
    where not exists (
      select 1 from public.studio_closures sc
      where sc.organization_id = c.organization_id
        and sc.date = t.day
        and (sc.location_id is null or sc.location_id = v_location)
    )
    -- 出欠済み・実施済み・休講で残した回と同じ日付は、ここで弾かれる
    on conflict (class_id, date) do nothing
    returning 1
  )
  select count(*) into v_created from inserted;

  return query select v_created, v_removed, v_kept, v_skipped;
end;
$fn$;

comment on function public.generate_lessons(uuid) is
  '期の期間からレッスンを一括生成する（設計書 5.1）。'
  '出欠が記録された回と、実施済み・休講にした回は作り直しの対象から外す。';

revoke all on function public.generate_lessons(uuid) from public, anon;
grant execute on function public.generate_lessons(uuid) to authenticated;
