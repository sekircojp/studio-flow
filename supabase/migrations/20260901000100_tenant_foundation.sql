-- =============================================================================
-- 001: テナント基盤
--   設計書 3章（マルチテナント設計）/ 4.1（テナント・組織）/ 7章（権限）に対応
--
-- このマイグレーションで決めた規約は、以降の全テーブルが踏襲する。
--   - 主キーは uuid、既定値は gen_random_uuid()
--   - 日時は timestamptz（UTC 保存）。表示側で Asia/Tokyo に変換する
--   - 状態は text + CHECK 制約で表す（PostgreSQL の enum 型は使わない）
--   - organizations 以外の全業務テーブルに organization_id を必須列で持つ
--   - 全テーブルで RLS を有効化する
--   - 物理削除はしない。状態列で表現する
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app スキーマ: RLS から呼ぶ内部ヘルパー置き場。
-- public ではないので PostgREST の API には公開されない。
-- -----------------------------------------------------------------------------
create schema if not exists app;
comment on schema app is 'アプリ内部用のヘルパー関数。PostgREST には公開しない。';

grant usage on schema app to authenticated;

-- updated_at を自動更新するトリガ関数
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;


-- =============================================================================
-- organizations: テナント（＝契約スタジオ）
-- =============================================================================
create table public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  business_type            text,
  plan                     text not null default 'FREE'
                             check (plan in ('FREE', 'STANDARD')),
  status                   text not null default 'active'
                             check (status in ('active', 'suspended', 'canceled')),

  -- 知人向けの個別契約価格（設計書 8章）。適用期間と内部理由を必ず伴う
  custom_price             integer check (custom_price >= 0),
  custom_price_reason      text,
  custom_price_valid_until date,

  -- 将来、流通額連動の収益化に切り替える場合にのみ 0 以外を入れる（設計書 6.1.1）
  application_fee_rate     numeric(5, 4) not null default 0
                             check (application_fee_rate >= 0 and application_fee_rate <= 1),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- 個別価格を入れるなら適用期限と内部理由をセットで必須にする（設計書 8章の運用ルール）
  constraint organizations_custom_price_requires_terms check (
    custom_price is null
    or (custom_price_reason is not null and custom_price_valid_until is not null)
  )
);

comment on table public.organizations is 'テナント。契約スタジオ1件につき1行。';
comment on column public.organizations.custom_price is '個別契約価格（円・税込）。null なら plan の標準価格。';
comment on column public.organizations.custom_price_reason is '内部理由。スタジオ側の画面には絶対に表示しない（設計書 8章）。';
comment on column public.organizations.application_fee_rate is 'Stripe のアプリケーション手数料率。初期は 0。';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function app.set_updated_at();


-- =============================================================================
-- memberships: ログインユーザー（auth.users）とテナントの結び付き
--
-- 設計書 4章にはこのテーブルの記載がないが、「ロールはサーバーセッションから
-- 決定する」（3章・7章）ためには auth.users -> organization_id -> role を引ける
-- 場所が必要になる。RLS の判定もすべてこのテーブルを起点にする。
-- =============================================================================
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null
                    check (role in ('owner', 'staff', 'instructor', 'guardian', 'student')),
  status          text not null default 'active'
                    check (status in ('active', 'suspended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 1人のユーザーが同じテナント内で複数のロールを持つことはしない。
  -- オーナーが講師を兼ねる場合は owner のまま、アプリ側で /staff/* も許可する。
  unique (organization_id, user_id)
);

comment on table public.memberships is 'ユーザーとテナントの所属。ロール判定と RLS の起点。';
comment on column public.memberships.role is 'owner / staff / instructor / guardian / student。未成年の生徒はログインさせないため student は成人生徒のみ。';

create index memberships_user_id_idx on public.memberships (user_id) where status = 'active';
create index memberships_organization_id_idx on public.memberships (organization_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function app.set_updated_at();


-- =============================================================================
-- super_admins: SaaS 運営（合同会社セキレイ）側の担当者
--
-- /superadmin/* は service_role キーで動かす。service_role は RLS を
-- バイパスするため、この表は「誰がその画面に入れるか」の名簿としてのみ使う。
-- =============================================================================
create table public.super_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.super_admins is 'Super Admin の名簿。RLS ポリシーを一切与えず、service_role からのみ読む。';


-- =============================================================================
-- RLS ヘルパー
--
-- security definer にしているのは、memberships 自身の RLS を評価しようとして
-- 無限再帰するのを防ぐため。search_path を空にし、関数内は完全修飾する。
-- =============================================================================

-- 現在のユーザーが所属しているテナントの id 一覧
create or replace function app.current_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.organization_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$fn$;

-- 現在のユーザーが、指定テナントで指定ロールのいずれかを持つか
create or replace function app.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target_organization_id
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$fn$;

-- 現在のユーザーが Super Admin か
create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.super_admins s where s.user_id = (select auth.uid())
  );
$fn$;

revoke all on function app.current_organization_ids() from public;
revoke all on function app.has_org_role(uuid, text[]) from public;
revoke all on function app.is_super_admin() from public;

grant execute on function app.current_organization_ids() to authenticated;
grant execute on function app.has_org_role(uuid, text[]) to authenticated;
grant execute on function app.is_super_admin() to authenticated;


-- =============================================================================
-- brand_settings: スタジオのブランド表示（設計書 12章）
-- =============================================================================
create table public.brand_settings (
  organization_id             uuid primary key
                                references public.organizations (id) on delete cascade,
  studio_name                 text,
  logo_url                    text,
  brand_color                 text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  tel                         text,
  email                       text,
  address                     text,
  website                     text,
  -- 適格請求書発行事業者の登録番号。免税事業者が多数のため任意項目（設計書 4.1）
  invoice_registration_number text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.brand_settings is 'テナント1件につき1行。ロゴ・カラーはここに集約し、画面側に直書きしない。';
comment on column public.brand_settings.invoice_registration_number is '任意。未登録なら帳票に表記を出さない。';

create trigger brand_settings_set_updated_at
  before update on public.brand_settings
  for each row execute function app.set_updated_at();


-- =============================================================================
-- locations: 校舎・会場
-- =============================================================================
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  address         text,
  tel             text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- rooms から (location_id, organization_id) で参照するための一意制約。
  -- 部屋と校舎のテナントが食い違うことを DB 側で防ぐ
  unique (id, organization_id)
);

comment on table public.locations is '校舎・会場。廃止は is_active = false で表す（物理削除しない）。';

create index locations_organization_id_idx on public.locations (organization_id);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function app.set_updated_at();


-- =============================================================================
-- rooms: 部屋
--
-- 部屋が1つしかないスタジオでも Location 配下に必ず1件作る（設計書 4.1）。
-- =============================================================================
create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id     uuid not null,
  name            text not null,
  capacity        integer check (capacity is null or capacity > 0),
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 校舎と部屋が同じテナントに属することを保証する複合外部キー
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete restrict
);

comment on table public.rooms is '部屋。capacity は物理的な収容数の目安。定員判定は classes 側の2種類の定員で行う（設計書 5.2）。';

create index rooms_location_id_idx on public.rooms (location_id);
create index rooms_organization_id_idx on public.rooms (organization_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function app.set_updated_at();
