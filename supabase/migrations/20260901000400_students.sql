-- =============================================================================
-- 004: 生徒・保護者・世帯・採寸履歴
--   設計書 4.3 に対応
--
-- 世帯を独立させているのは、請求が生徒単位である一方で、兄弟割の判定が
-- 世帯単位で行われるため（設計書 5.5）。生徒に保護者を直接ぶら下げると、
-- 兄弟をまとめる手段が無くなる。
-- =============================================================================

-- =============================================================================
-- households: 世帯
-- =============================================================================
create table public.households (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  name                text not null,

  -- 請求の宛先になる保護者。guardians を作ってから外部キーを張る（相互参照のため）
  billing_guardian_id uuid,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- guardians / students から (household_id, organization_id) で参照するための一意制約。
  -- 世帯と保護者・生徒のテナントが食い違うことを DB 側で防ぐ
  unique (id, organization_id)
);

comment on table public.households is '世帯。兄弟割の判定単位（設計書 5.5）。';
comment on column public.households.name is '「山田家」など。表示と検索のための名称。';

create index households_organization_id_idx on public.households (organization_id);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function app.set_updated_at();


-- =============================================================================
-- guardians: 保護者
-- =============================================================================
create table public.guardians (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  household_id       uuid not null,

  -- ★ 設計書 4.3 に無い列
  --   保護者マイページ（/my/*・設計書 7章）を出すには、ログインした人が
  --   どの保護者なのかを引ける必要がある。memberships だけでは
  --   「このユーザーは保護者ロール」までしか分からない。
  --   スタジオが登録しただけでまだログインしていない保護者もいるので null 可。
  user_id            uuid references auth.users (id) on delete set null,

  name               text not null,
  name_kana          text,
  relationship       text,
  email              text,
  tel                text,
  address            text,
  emergency_contact  text,

  -- LINE 連携はフェーズ1では実装しない（設計書 9.1）。列だけ用意しておく
  line_user_id       text,

  is_billing_contact boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  foreign key (household_id, organization_id)
    references public.households (id, organization_id) on delete restrict
);

comment on table public.guardians is '保護者。1世帯に複数いてよい。';
comment on column public.guardians.user_id is 'ログイン用の auth.users。未ログイン登録の保護者は null。';
comment on column public.guardians.relationship is '続柄（母・父・祖母など）。自由入力。';
comment on column public.guardians.line_user_id is 'フェーズ1では未使用（設計書 9.1）。列のみ用意。';

create index guardians_household_id_idx on public.guardians (household_id);
create index guardians_organization_id_idx on public.guardians (organization_id);
create index guardians_user_id_idx on public.guardians (user_id) where user_id is not null;

create trigger guardians_set_updated_at
  before update on public.guardians
  for each row execute function app.set_updated_at();

-- 世帯 → 請求先保護者の外部キーを、guardians ができた後に張る
alter table public.households
  add constraint households_billing_guardian_id_fkey
  foreign key (billing_guardian_id) references public.guardians (id) on delete set null;


-- =============================================================================
-- students: 生徒
-- =============================================================================
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  household_id    uuid not null,

  -- ★ 設計書 4.3 に無い列
  --   成人生徒は自分でログインする（設計書 7章）。未成年はログインさせず、
  --   保護者アカウントから操作するため、ほとんどの行は null になる。
  user_id         uuid references auth.users (id) on delete set null,

  name            text not null,
  name_kana       text,
  birth_date      date,

  -- 男女以外の回答や未回答を許すため、値の制約は付けない
  gender          text,

  -- 学年。毎年変わるので、運用で更新する前提の項目
  grade           text,

  enrolled_on     date,

  status          text not null default 'trial'
                    check (status in ('trial', 'active',
                                      'suspended_billed', 'suspended_unbilled',
                                      'withdrawn')),
  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (household_id, organization_id)
    references public.households (id, organization_id) on delete restrict,

  -- student_measurements から (id, organization_id) で参照するため
  unique (id, organization_id)
);

comment on table public.students is '生徒。退会も行は残し status = withdrawn で表す（物理削除しない）。';
comment on column public.students.user_id is '成人生徒のログイン用。未成年は null（保護者アカウントから操作する）。';
comment on column public.students.status is
  'trial 体験 / active 在籍 / suspended_billed 休会（請求あり） / suspended_unbilled 休会（請求停止） / withdrawn 退会。'
  '休会を2種類持つのは、休会費を設定した場合に請求が発生し、ダッシュボードの件数が合わなくなるため（設計書 4.3）。';
comment on column public.students.grade is '学年。毎年の更新が必要。誕生日からの自動算出は行わない。';

create index students_household_id_idx on public.students (household_id);
create index students_organization_id_idx on public.students (organization_id);
create index students_user_id_idx on public.students (user_id) where user_id is not null;

-- 在籍者数のカウント（設計書 8章。FREE プランは在籍10名まで）でよく使う
create index students_active_idx on public.students (organization_id) where status = 'active';

create trigger students_set_updated_at
  before update on public.students
  for each row execute function app.set_updated_at();


-- =============================================================================
-- student_measurements: 採寸履歴
--
-- 生徒の属性として単一の値を持たない。子どもは成長するため、
-- いつ時点の数値かが分からないと使えない（設計書 4.3）。
-- 「サイズ情報の更新が必要」の判定も、最新の measured_at からの
-- 経過日数で行う。
--
-- 発表会・衣装管理はフェーズ1では実装しない（設計書 9.1）。
-- テーブルだけ用意しておく。
-- =============================================================================
create table public.student_measurements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id      uuid not null,

  -- 採寸日。日付だけを持つ列なのでタイムゾーン変換をしない（設計書 2.1）
  measured_at     date not null,

  height          numeric(4, 1) check (height is null or height > 0),
  wear_size       text,
  shoe_size       numeric(4, 1) check (shoe_size is null or shoe_size > 0),
  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict
);

comment on table public.student_measurements is '採寸の履歴。最新値ではなく、いつ測ったかを含めて残す。';
comment on column public.student_measurements.height is '身長 cm。147.5 のような小数を許す。';
comment on column public.student_measurements.wear_size is 'ウェアのサイズ。150 / M など表記が揺れるため文字列。';

-- 「最新の採寸」を引く経路
create index student_measurements_latest_idx
  on public.student_measurements (student_id, measured_at desc);

create trigger student_measurements_set_updated_at
  before update on public.student_measurements
  for each row execute function app.set_updated_at();
