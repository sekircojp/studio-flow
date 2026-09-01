-- =============================================================================
-- 002: テナント基盤の RLS
--   設計書 3章（全テーブルで RLS 有効化）/ 7章（権限）に対応
--
-- 方針
--   - policy は必ず `to authenticated` を付ける。anon には1行も見せない
--   - 参照は「自分が所属するテナントの行だけ」
--   - 更新系のロールは2段階に分ける
--       organizations / brand_settings / memberships … owner のみ
--       locations / rooms                            … owner + staff
--   - delete ポリシーはどのテーブルにも作らない。
--     設計書の「物理削除はしない」を DB 側で担保するため
--   - Super Admin は service_role キーで接続し RLS をバイパスする。
--     そのため policy 側には Super Admin の分岐を書かない
--
-- 注意: RLS はあくまで保険。アプリ層でも必ず organization_id で絞り込むこと。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anon（未ログイン）にはテーブル権限そのものを与えない
-- -----------------------------------------------------------------------------
revoke all on table public.organizations   from anon;
revoke all on table public.memberships     from anon;
revoke all on table public.super_admins    from anon;
revoke all on table public.brand_settings  from anon;
revoke all on table public.locations       from anon;
revoke all on table public.rooms           from anon;

-- super_admins は authenticated からも触らせない（service_role のみ）
revoke all on table public.super_admins from authenticated;


-- -----------------------------------------------------------------------------
-- RLS 有効化
-- -----------------------------------------------------------------------------
alter table public.organizations  enable row level security;
alter table public.memberships    enable row level security;
alter table public.super_admins   enable row level security;
alter table public.brand_settings enable row level security;
alter table public.locations      enable row level security;
alter table public.rooms          enable row level security;


-- =============================================================================
-- organizations
-- =============================================================================
create policy "所属テナントのみ参照できる"
  on public.organizations for select to authenticated
  using (id in (select app.current_organization_ids()));

create policy "オーナーは自テナントを更新できる"
  on public.organizations for update to authenticated
  using (app.has_org_role(id, array['owner']))
  with check (app.has_org_role(id, array['owner']));

-- insert は作らない。テナントの新規作成は service_role 経由でのみ行う。


-- =============================================================================
-- memberships
-- =============================================================================
create policy "自分の所属と、オーナー・スタッフは自テナント全員を参照できる"
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_org_role(organization_id, array['owner', 'staff'])
  );

create policy "オーナーは自テナントに所属を追加できる"
  on public.memberships for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));

create policy "オーナーは自テナントの所属を更新できる"
  on public.memberships for update to authenticated
  using (app.has_org_role(organization_id, array['owner']))
  with check (app.has_org_role(organization_id, array['owner']));

-- 退職・退会は status = 'suspended' で表す。delete ポリシーは作らない。


-- =============================================================================
-- super_admins
--   ポリシーを1つも作らない = authenticated からは常に0行。
-- =============================================================================


-- =============================================================================
-- brand_settings
-- =============================================================================
create policy "所属テナントのブランド設定を参照できる"
  on public.brand_settings for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーはブランド設定を作成できる"
  on public.brand_settings for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));

create policy "オーナーはブランド設定を更新できる"
  on public.brand_settings for update to authenticated
  using (app.has_org_role(organization_id, array['owner']))
  with check (app.has_org_role(organization_id, array['owner']));


-- =============================================================================
-- locations
-- =============================================================================
create policy "所属テナントの校舎を参照できる"
  on public.locations for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは校舎を作成できる"
  on public.locations for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは校舎を更新できる"
  on public.locations for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- =============================================================================
-- rooms
-- =============================================================================
create policy "所属テナントの部屋を参照できる"
  on public.rooms for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは部屋を作成できる"
  on public.rooms for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは部屋を更新できる"
  on public.rooms for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));
