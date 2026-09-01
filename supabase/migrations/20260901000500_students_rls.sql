-- =============================================================================
-- 005: 生徒・保護者・世帯・採寸履歴の権限と RLS
--   設計書 3章 / 7章 に対応
--
-- 001-002 と同じ方針を踏襲する。
--   - policy は必ず `to authenticated`。anon には1行も見せない
--   - delete ポリシーは作らない（物理削除しない）
--   - Super Admin は service_role で RLS をバイパスするため policy に書かない
--
-- このマイグレーションで新しく必要になるのは「自世帯だけ見せる」判定。
-- 保護者と成人生徒は、自分の世帯の行しか見えてはならない（設計書 7章）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 自世帯・自世帯の生徒を引くヘルパー
--
-- security definer にしているのは、policy の中から guardians / students を
-- 読もうとすると、その表自身の RLS を評価しようとして無限再帰するため。
-- 001 の app.current_organization_ids() と同じ理由。
-- -----------------------------------------------------------------------------
create or replace function app.current_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select g.household_id
  from public.guardians g
  where g.user_id = (select auth.uid())
  union
  select s.household_id
  from public.students s
  where s.user_id = (select auth.uid());
$fn$;

create or replace function app.current_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id
  from public.students s
  where s.household_id in (select app.current_household_ids());
$fn$;

revoke all on function app.current_household_ids() from public;
revoke all on function app.current_student_ids() from public;
grant execute on function app.current_household_ids() to authenticated;
grant execute on function app.current_student_ids() to authenticated;


-- -----------------------------------------------------------------------------
-- テーブル権限
-- "Automatically expose new tables" を無効にしているため、明示的に与える。
-- delete はどのロールにも与えない。
-- -----------------------------------------------------------------------------
revoke all on table public.households           from anon;
revoke all on table public.guardians            from anon;
revoke all on table public.students             from anon;
revoke all on table public.student_measurements from anon;

grant select, insert, update on table public.households           to authenticated;
grant select, insert, update on table public.guardians            to authenticated;
grant select, insert, update on table public.students             to authenticated;
grant select, insert, update on table public.student_measurements to authenticated;

grant all on table public.households           to service_role;
grant all on table public.guardians            to service_role;
grant all on table public.students             to service_role;
grant all on table public.student_measurements to service_role;


-- -----------------------------------------------------------------------------
-- RLS 有効化
-- -----------------------------------------------------------------------------
alter table public.households           enable row level security;
alter table public.guardians            enable row level security;
alter table public.students             enable row level security;
alter table public.student_measurements enable row level security;


-- =============================================================================
-- households
-- =============================================================================
create policy "オーナーとスタッフは自テナントの世帯を参照できる"
  on public.households for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or id in (select app.current_household_ids())
  );

create policy "オーナーとスタッフは世帯を作成できる"
  on public.households for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは世帯を更新できる"
  on public.households for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- =============================================================================
-- guardians
--
-- ★ 講師には見せない。
--   設計書 7章の講師の範囲は「担当レッスン、出欠、生徒一覧」で、保護者の
--   連絡先は含まれていない。緊急連絡が必要になった場合の扱いは、
--   運用が固まってから決める。広げるのは後からでもできるが、
--   一度見せたものを狭めるのは難しい。
-- =============================================================================
create policy "オーナーとスタッフ、および本人の世帯は保護者を参照できる"
  on public.guardians for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or household_id in (select app.current_household_ids())
  );

create policy "オーナーとスタッフは保護者を登録できる"
  on public.guardians for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは保護者を更新できる"
  on public.guardians for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- =============================================================================
-- students
--
-- 講師は出欠の登録に生徒一覧が要るため、参照だけ許す（設計書 7章）。
-- =============================================================================
create policy "オーナー・スタッフ・講師、および本人の世帯は生徒を参照できる"
  on public.students for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or household_id in (select app.current_household_ids())
  );

create policy "オーナーとスタッフは生徒を登録できる"
  on public.students for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは生徒を更新できる"
  on public.students for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- =============================================================================
-- student_measurements
-- =============================================================================
create policy "オーナーとスタッフ、および本人の世帯は採寸を参照できる"
  on public.student_measurements for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは採寸を登録できる"
  on public.student_measurements for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは採寸を更新できる"
  on public.student_measurements for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));
