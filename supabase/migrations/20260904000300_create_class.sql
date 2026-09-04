-- =============================================================================
-- 020: クラスの登録（開催枠を同時に作る）
--   設計書 4.2 に対応
--
-- なぜ関数にまとめるか
--   クラスと開催枠は 2 件以上の INSERT になる。画面側から順に呼ぶと、
--   開催枠の登録で失敗したときに「開催日の無いクラス」だけが残る。
--   classes に delete は与えていないため（物理削除しない方針）、
--   その残骸を画面側から片付けられない。
--   create_student と同じく、1 つの関数にまとめてトランザクションで扱う。
--
-- p_meetings は開催枠の配列。
--   [{"room_id":"…","day_of_week":2,"start_time":"16:00","end_time":"17:00"}, …]
-- 週2回のクラスなら2要素入る。
-- =============================================================================

create or replace function public.create_class(
  p_organization_id     uuid,
  p_season_id           uuid,
  p_name                text,
  p_meetings            jsonb,
  p_genre               text    default null,
  p_level               text    default null,
  p_instructor_id       uuid    default null,
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
    organization_id, season_id, instructor_id,
    name, genre, level,
    enrollment_capacity, room_capacity, monthly_fee
  )
  values (
    p_organization_id, p_season_id, p_instructor_id,
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

  return v_class_id;
end;
$fn$;

comment on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid, integer, integer, integer) is
  'クラスと開催枠を同じトランザクションで作る（設計書 4.2）。'
  '開催日の無いクラスを残さないため。';

revoke all on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid, integer, integer, integer)
  from public, anon;
grant execute on function public.create_class(uuid, uuid, text, jsonb, text, text, uuid, integer, integer, integer)
  to authenticated;
