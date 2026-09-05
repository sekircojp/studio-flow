-- =============================================================================
-- 023: スタジオの登録（最初のルームを同時に作る）
--   設計書 4.1 に対応
--
-- 設計書 4.1 は「ルームは必ず持つ。ルームが1つしかないスタジオでも
-- スタジオの下にルームを1件作る」と決めている。後から2つ目のルームが
-- できたときに構造が壊れないようにするためで、この判断は変えない。
--
-- ただし、それを運営者に入力させる必要はない。
-- 1部屋しかないスタジオの人にとって「ルーム名」は存在しない概念で、
-- 「ルーム名を入れてください」と言われても答えようがない。
--
-- そこで、スタジオを作ったときに既定のルームを1件いっしょに作る。
-- ルームを分けているスタジオだけが、あとから名前を変えたり足したりする。
--
-- 2件の INSERT になるので関数にまとめる。途中で失敗すると
-- 「ルームの無いスタジオ」が残り、クラスを作れない状態になる。
-- create_student / create_class と同じ考え方。
-- =============================================================================

create or replace function public.create_location(
  p_organization_id uuid,
  p_name            text,
  p_address         text default null,
  p_tel             text default null,
  p_room_name       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_location_id uuid;
begin
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  insert into public.locations (organization_id, name, address, tel)
  values (p_organization_id, p_name, p_address, p_tel)
  returning id into v_location_id;

  insert into public.rooms (organization_id, location_id, name)
  values (
    p_organization_id,
    v_location_id,
    coalesce(nullif(btrim(p_room_name), ''), 'メインルーム')
  );

  return v_location_id;
end;
$fn$;

comment on function public.create_location(uuid, text, text, text, text) is
  'スタジオと最初のルームを同じトランザクションで作る（設計書 4.1）。'
  'ルームの無いスタジオを残さないため。';

revoke all on function public.create_location(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_location(uuid, text, text, text, text)
  to authenticated;
