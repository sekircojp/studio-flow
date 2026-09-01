-- =============================================================================
-- 006: 校舎の削除
--
-- ★ 設計書「データの物理削除はしない。状態変更で表現する」への例外
--
--   運営判断として、間違えて登録した校舎を消せるようにする。
--   ただし、実績のある校舎は消せない。校舎を消すと
--     校舎 → 部屋 → クラス → レッスン → 出欠
--   が芋づるで消えることになり、「校舎の情報だけ消して、それ以外は残す」
--   という意図と正反対の結果になるため。
--
--   実際に運営していた校舎は is_active = false（閉校）で表す。
--   一覧からは外れるが、過去のデータは残る。
--
-- 実装方針
--   - 削除は関数1本にまとめ、部屋と校舎を同じトランザクションで消す。
--     途中で外部キーに阻まれた場合、部屋の削除ごと巻き戻る
--   - authenticated に delete 権限は与えたままにしない。
--     security definer の関数の中でだけ削除できるようにする
--   - 関数の中で呼び出し元のロールを必ず確認する。
--     RPC は URL さえ分かれば誰でも叩けるため
-- =============================================================================

create or replace function public.delete_location(target_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  select l.organization_id into v_org
  from public.locations l
  where l.id = target_location_id;

  if v_org is null then
    raise exception 'location_not_found'
      using errcode = 'no_data_found';
  end if;

  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(v_org, array['owner', 'staff']) then
    raise exception 'forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- 部屋が他から参照されていれば、ここで外部キー違反になり全体が巻き戻る。
  -- 呼び出し側はその場合「閉校にしてください」と案内する
  delete from public.rooms where location_id = target_location_id;
  delete from public.locations where id = target_location_id;
end;
$fn$;

comment on function public.delete_location(uuid) is
  '実績のない校舎を部屋ごと削除する。参照が残っていれば外部キー違反で巻き戻る。'
  '運営していた校舎は削除せず is_active = false（閉校）で表す。';

revoke all on function public.delete_location(uuid) from public, anon;
grant execute on function public.delete_location(uuid) to authenticated;
