-- =============================================================================
-- 008: 講師・定期クラス・レッスン
--   設計書 4.2 / 4.7 に対応
--
-- 講師は 4.7 のうち instructors のみを作る。
-- compensation_rules と monthly_compensations（報酬計算）は
-- フェーズ1では実装しない（設計書 9.1）。
-- =============================================================================

-- rooms を複合外部キーで参照できるようにする（テナントの食い違いを防ぐため）
alter table public.rooms add constraint rooms_id_organization_id_key
  unique (id, organization_id);


-- =============================================================================
-- instructors: 講師
-- =============================================================================
create table public.instructors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- ログイン用。スタジオが登録しただけでまだログインしていない講師は null
  user_account_id uuid references auth.users (id) on delete set null,

  name            text not null,
  name_kana       text,
  tel             text,
  email           text,
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id)
);

comment on table public.instructors is '講師。報酬計算（設計書 4.7 の compensation_rules）はフェーズ1では作らない。';
comment on column public.instructors.user_account_id is 'ログイン用の auth.users。未ログイン登録の講師は null。';

create index instructors_organization_id_idx on public.instructors (organization_id);
create index instructors_user_account_id_idx on public.instructors (user_account_id)
  where user_account_id is not null;

create trigger instructors_set_updated_at
  before update on public.instructors
  for each row execute function app.set_updated_at();


-- =============================================================================
-- classes: 定期クラス
--
-- 定員を2つ持つ（設計書 5.2）。
--   enrollment_capacity … 在籍定員。新規入会の可否を決める
--   room_capacity       … 1レッスンの実収容上限。体験・振替の受入可否を決める
-- 在籍が満席でも実収容上限までは体験・振替を受け入れられ、
-- 同時に部屋の物理的な上限を超えることもない。
-- =============================================================================
create table public.classes (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  season_id              uuid not null,
  room_id                uuid not null,
  instructor_id          uuid,

  name                   text not null,
  genre                  text,
  level                  text,
  target_age_min         integer check (target_age_min is null or target_age_min >= 0),
  target_age_max         integer check (target_age_max is null or target_age_max >= 0),

  -- 0 = 日曜 … 6 = 土曜。PostgreSQL の extract(dow) と同じ並び
  day_of_week            integer not null check (day_of_week between 0 and 6),
  start_time             time not null,
  end_time               time not null,

  enrollment_capacity    integer check (enrollment_capacity is null or enrollment_capacity > 0),
  room_capacity          integer check (room_capacity is null or room_capacity > 0),

  -- 税込・整数（円）。税率を併せて持つ（設計書 2.2）
  monthly_fee            integer not null default 0 check (monthly_fee >= 0),
  tax_rate               numeric(5, 4) not null default 0.10
                           check (tax_rate >= 0 and tax_rate < 1),

  accepts_new_enrollment boolean not null default true,
  accepts_trial          boolean not null default true,
  accepts_transfer       boolean not null default true,
  is_public              boolean not null default false,
  description            text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint classes_time_order check (start_time < end_time),
  constraint classes_age_order check (
    target_age_min is null or target_age_max is null or target_age_min <= target_age_max
  ),

  foreign key (season_id, organization_id)
    references public.seasons (id, organization_id) on delete restrict,
  foreign key (room_id, organization_id)
    references public.rooms (id, organization_id) on delete restrict,
  foreign key (instructor_id, organization_id)
    references public.instructors (id, organization_id) on delete set null,

  unique (id, organization_id)
);

comment on table public.classes is '定期クラス。毎週同じ曜日・時間に開かれる枠。';
comment on column public.classes.day_of_week is '0 = 日曜 … 6 = 土曜。PostgreSQL の extract(dow) と同じ並び。';
comment on column public.classes.enrollment_capacity is '在籍定員。新規入会の可否に使う（設計書 5.2）。';
comment on column public.classes.room_capacity is '1レッスンの実収容上限。体験・振替の受入可否に使う（設計書 5.2）。';
comment on column public.classes.monthly_fee is '月謝の目安。税込・整数（円）。実際の請求額は student_contracts が持つ。';

create index classes_season_idx on public.classes (season_id, day_of_week, start_time);
create index classes_organization_id_idx on public.classes (organization_id);
create index classes_room_idx on public.classes (room_id);

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function app.set_updated_at();


-- =============================================================================
-- lessons: 開催回
--
-- classes から一括生成する（設計書 5.1）。生成後、回ごとに
-- 休講・時間変更・部屋変更・講師変更（代講）ができる。
-- =============================================================================
create table public.lessons (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  class_id              uuid not null,

  -- 生成時はクラスの値を写す。代講や部屋変更は、この行だけを書き換える
  room_id               uuid not null,
  instructor_id         uuid,

  -- 日付だけを持つ列（設計書 2.1）
  date                  date not null,

  -- 実際の開始・終了。UTC 保存、表示は Asia/Tokyo（設計書 2.1）
  start_at              timestamptz not null,
  end_at                timestamptz not null,

  status                text not null default 'scheduled'
                          check (status in ('scheduled', 'held', 'canceled')),
  cancel_reason         text,

  -- ★ 再生成の禁止ルール（設計書 5.1）
  --   出欠が1件でも記録されたレッスンは、再生成・一括削除の対象から必ず外す。
  --   クラスの曜日を変えて作り直したときに、記録済みの回が消えるのを防ぐ。
  has_attendance_record boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint lessons_time_order check (start_at < end_at),

  foreign key (class_id, organization_id)
    references public.classes (id, organization_id) on delete restrict,
  foreign key (room_id, organization_id)
    references public.rooms (id, organization_id) on delete restrict,
  foreign key (instructor_id, organization_id)
    references public.instructors (id, organization_id) on delete set null,

  -- 同じクラスの同じ日を2回作らない
  unique (class_id, date),

  unique (id, organization_id)
);

comment on table public.lessons is 'レッスンの開催回。classes から一括生成する（設計書 5.1）。';
comment on column public.lessons.has_attendance_record is
  '出欠が1件でも記録されたか。true の回は再生成・一括削除の対象から必ず外す（設計書 5.1）。';
comment on column public.lessons.status is 'scheduled 予定 / held 実施済 / canceled 休講。休講は保護者のカレンダーにも表示する。';

create index lessons_calendar_idx on public.lessons (organization_id, date);
create index lessons_class_idx on public.lessons (class_id, date);
create index lessons_instructor_idx on public.lessons (instructor_id, date)
  where instructor_id is not null;

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function app.set_updated_at();


-- =============================================================================
-- 権限と RLS
-- =============================================================================
revoke all on table public.instructors from anon;
revoke all on table public.classes     from anon;
revoke all on table public.lessons      from anon;

grant select, insert, update on table public.instructors to authenticated;
grant select, insert, update on table public.classes     to authenticated;
grant select, insert, update on table public.lessons      to authenticated;

grant all on table public.instructors to service_role;
grant all on table public.classes     to service_role;
grant all on table public.lessons      to service_role;

alter table public.instructors enable row level security;
alter table public.classes     enable row level security;
alter table public.lessons     enable row level security;


-- -----------------------------------------------------------------------------
-- instructors
--
-- 参照は所属者全員。保護者も担当講師の名前は見える必要がある。
-- 連絡先まで見せてよいかは運用が固まってから絞る余地を残す。
-- -----------------------------------------------------------------------------
create policy "所属テナントの講師を参照できる"
  on public.instructors for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは講師を登録できる"
  on public.instructors for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは講師を更新できる"
  on public.instructors for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- -----------------------------------------------------------------------------
-- classes / lessons
--
-- 参照は所属者全員。保護者マイページのカレンダーと、講師の担当レッスン一覧に要る。
-- 休講もそのまま見えることで、個別連絡が不要になる（設計書 5.1）。
-- -----------------------------------------------------------------------------
create policy "所属テナントのクラスを参照できる"
  on public.classes for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフはクラスを登録できる"
  on public.classes for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフはクラスを更新できる"
  on public.classes for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "所属テナントのレッスンを参照できる"
  on public.lessons for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフはレッスンを登録できる"
  on public.lessons for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

-- 講師も担当回を更新できる。休講の記録や実施済みへの切り替えを
-- 現場で行うため（設計書 7章の講師の範囲）。
create policy "オーナー・スタッフ・担当講師はレッスンを更新できる"
  on public.lessons for update to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or app.has_org_role(organization_id, array['instructor'])
  )
  with check (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or app.has_org_role(organization_id, array['instructor'])
  );
