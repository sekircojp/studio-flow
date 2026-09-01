-- =============================================================================
-- 007: 期（シーズン）と休講日マスタ
--   設計書 4.2 に対応
--
-- この2つは、レッスンの一括生成（設計書 5.1）の入力になる。
--   期の start_date 〜 end_date を走査
--   → クラスの曜日に一致する日を抽出
--   → studio_closures に該当する日を除外
--   → lessons を生成
-- =============================================================================

-- =============================================================================
-- seasons: 期
-- =============================================================================
create table public.seasons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  start_date      date not null,
  end_date        date not null,

  -- 「今の期」。組織内で1つだけ
  is_current      boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint seasons_period_order check (start_date <= end_date),

  -- classes から (id, organization_id) で参照するため
  unique (id, organization_id)
);

comment on table public.seasons is '期。レッスン一括生成の対象期間（設計書 5.1）。';
comment on column public.seasons.is_current is '現在の期。組織内で1件だけ。部分一意索引で担保する。';

-- 「今の期」が2つになると、どの期に対して生成すべきかが決まらなくなる
create unique index seasons_one_current_idx
  on public.seasons (organization_id)
  where is_current;

create index seasons_organization_id_idx on public.seasons (organization_id, start_date desc);

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function app.set_updated_at();


-- =============================================================================
-- studio_closures: 休講日マスタ
--
-- location_id が null なら全校舎の休講。
-- 特定の校舎だけ休みにする場合に校舎を指定する。
-- =============================================================================
create table public.studio_closures (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- 日付だけを持つ列なのでタイムゾーン変換をしない（設計書 2.1）
  date            date not null,
  name            text not null,

  -- null = 全校舎
  location_id     uuid,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 校舎を指定した場合だけ、テナントの一致を検査する。
  -- location_id が null のときは検査されない（MATCH SIMPLE の既定動作）
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade,

  -- 同じ日・同じ校舎の重複を防ぐ。
  -- nulls not distinct を付けないと「全校舎」の行が何件でも作れてしまう
  unique nulls not distinct (organization_id, date, location_id)
);

comment on table public.studio_closures is '休講日。レッスン一括生成の除外日（設計書 5.1）。';
comment on column public.studio_closures.location_id is 'null なら全校舎。特定の校舎だけ休みにする場合に指定する。';

create index studio_closures_lookup_idx
  on public.studio_closures (organization_id, date);

create trigger studio_closures_set_updated_at
  before update on public.studio_closures
  for each row execute function app.set_updated_at();


-- =============================================================================
-- 権限と RLS
-- =============================================================================
revoke all on table public.seasons         from anon;
revoke all on table public.studio_closures from anon;

grant select, insert, update on table public.seasons to authenticated;

-- ★ studio_closures だけ delete を与えている
--   休講日は日付の一覧であり、他のテーブルから参照されない。
--   レッスンは生成時に休講日を「除外する」だけで、外部キーで結びついていない。
--   そのため消しても失われる履歴が無く、間違って入れた日を残す利点もない。
grant select, insert, update, delete on table public.studio_closures to authenticated;

grant all on table public.seasons         to service_role;
grant all on table public.studio_closures to service_role;

alter table public.seasons         enable row level security;
alter table public.studio_closures enable row level security;


-- -----------------------------------------------------------------------------
-- seasons
--
-- 参照は所属者全員に許す。保護者にも「いつからいつまでが今の期か」は見える
-- 必要がある（マイページのカレンダー）。
-- -----------------------------------------------------------------------------
create policy "所属テナントの期を参照できる"
  on public.seasons for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは期を作成できる"
  on public.seasons for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは期を更新できる"
  on public.seasons for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- -----------------------------------------------------------------------------
-- studio_closures
--
-- 保護者カレンダーに休講を反映させるため（設計書 13章）、参照は所属者全員。
-- -----------------------------------------------------------------------------
create policy "所属テナントの休講日を参照できる"
  on public.studio_closures for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは休講日を登録できる"
  on public.studio_closures for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは休講日を更新できる"
  on public.studio_closures for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは休講日を削除できる"
  on public.studio_closures for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));
