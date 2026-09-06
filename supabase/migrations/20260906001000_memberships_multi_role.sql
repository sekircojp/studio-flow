-- =============================================================================
-- 033: 1人が同じスタジオで複数のロールを持てるようにする
--   設計書 7章
--
-- これまで memberships は (organization_id, user_id) で一意だった。そのため
-- オーナーや講師の子どもが同じスタジオに通っている場合、その人に保護者の
-- 所属を作れず、マイページに入れなかった。
--
-- 入会申込の承認でメールアドレスから保護者に結びつけたときに、この制約に
-- 当たって所属だけが作られない状態になっていた（guardians.user_id は
-- 埋まるのに /my に入れない）。
--
-- SessionContext は元から所属を配列で返しており、行き先の判定も
-- owner → instructor → guardian の順で選んでいるので、複数持っても
-- 画面側の扱いは変わらない。
-- =============================================================================

alter table public.memberships
  drop constraint if exists memberships_organization_id_user_id_key;

alter table public.memberships
  add constraint memberships_organization_id_user_id_role_key
  unique (organization_id, user_id, role);

comment on constraint memberships_organization_id_user_id_role_key on public.memberships is
  '同じスタジオで複数のロールを持てる。オーナーの子どもが通っている場合など。';
