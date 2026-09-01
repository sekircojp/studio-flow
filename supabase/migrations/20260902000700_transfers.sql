-- =============================================================================
-- 014: 欠席連絡と振替
--   設計書 4.4 / 5.3 に対応
--
-- ★ 設計書 5.3: ルールエンジンは実装しない。
--   振替の条件は6つの設定値だけで表す。
-- =============================================================================

-- =============================================================================
-- transfer_settings: 振替ルール（組織ごと・設計書 5.3 の6項目）
--
-- ★ 設計書 4章に置き場が無いため追加する。
-- =============================================================================
create table public.transfer_settings (
  organization_id uuid primary key
                    references public.organizations (id) on delete cascade,

  -- ① 欠席連絡の期限。レッスン開始の何時間前まで
  absence_deadline_hours integer not null default 2
                           check (absence_deadline_hours >= 0),

  -- ② 振替権の有効期限。発生から何日
  credit_valid_days      integer not null default 60
                           check (credit_valid_days > 0),

  -- ③ 上限回数。1か月あたり何回まで（0 = 制限なし）
  monthly_limit          integer not null default 2 check (monthly_limit >= 0),

  -- ④ 振替先の範囲
  scope                  text not null default 'same_class'
                           check (scope in ('same_class', 'same_genre', 'any_class')),

  -- ⑤ 振替回を欠席したときに権利を戻すか
  restore_on_absence     boolean not null default false,

  -- ⑥ 無断欠席に振替権を与えるか
  grant_on_no_contact    boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.transfer_settings is '振替ルール。設計書 5.3 の6項目だけで表す。ルールエンジンは作らない。';
comment on column public.transfer_settings.monthly_limit is '1か月あたりの振替上限。0 は制限なし。';

create trigger transfer_settings_set_updated_at
  before update on public.transfer_settings
  for each row execute function app.set_updated_at();


-- =============================================================================
-- absence_requests: 欠席連絡
-- =============================================================================
create table public.absence_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id      uuid not null,
  lesson_id       uuid not null,

  reason          text,
  submitted_at    timestamptz not null default now(),
  submitted_by    uuid references auth.users (id) on delete set null,

  created_at      timestamptz not null default now(),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,
  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict,

  -- 同じ回への欠席連絡は1件
  unique (lesson_id, student_id)
);

comment on table public.absence_requests is '欠席連絡。期限内かどうかで振替権の付与が変わる（設計書 5.3）。';

create index absence_requests_student_idx on public.absence_requests (student_id);
create index absence_requests_lesson_idx on public.absence_requests (lesson_id);


-- =============================================================================
-- transfer_credits: 振替権
-- =============================================================================
create table public.transfer_credits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  student_id       uuid not null,

  -- どの回を休んだことで生じた権利か
  source_lesson_id uuid not null,

  granted_at       timestamptz not null default now(),
  expires_at       date not null,
  used_at          timestamptz,

  status           text not null default 'available'
                     check (status in ('available', 'used', 'expired', 'revoked')),
  note             text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,
  foreign key (source_lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict,

  -- 1回の欠席から権利が2つ生まれないようにする
  unique (source_lesson_id, student_id),

  unique (id, organization_id)
);

comment on table public.transfer_credits is '振替権。1回の欠席につき1つ。期限切れは status で表し、行は消さない。';

create index transfer_credits_student_idx on public.transfer_credits (student_id, status);
create index transfer_credits_available_idx on public.transfer_credits (organization_id, expires_at)
  where status = 'available';

create trigger transfer_credits_set_updated_at
  before update on public.transfer_credits
  for each row execute function app.set_updated_at();


-- =============================================================================
-- transfer_bookings: 振替予約
-- =============================================================================
create table public.transfer_bookings (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  transfer_credit_id uuid not null,
  lesson_id          uuid not null,

  booked_at          timestamptz not null default now(),
  canceled_at        timestamptz,

  created_at         timestamptz not null default now(),

  foreign key (transfer_credit_id, organization_id)
    references public.transfer_credits (id, organization_id) on delete restrict,
  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict
);

comment on table public.transfer_bookings is '振替の予約。取消は canceled_at で表す。';

create index transfer_bookings_lesson_idx on public.transfer_bookings (lesson_id)
  where canceled_at is null;
create index transfer_bookings_credit_idx on public.transfer_bookings (transfer_credit_id);


-- =============================================================================
-- waitlists: キャンセル待ち
-- =============================================================================
create table public.waitlists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lesson_id       uuid not null,
  student_id      uuid not null,

  position        integer not null default 1 check (position > 0),
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),

  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict,
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,

  unique (lesson_id, student_id)
);

comment on table public.waitlists is 'キャンセル待ち。定員が空いたときの案内順を position で持つ。';

create index waitlists_lesson_idx on public.waitlists (lesson_id, position);


-- =============================================================================
-- 権限と RLS
-- =============================================================================
revoke all on table public.transfer_settings from anon;
revoke all on table public.absence_requests from anon;
revoke all on table public.transfer_credits from anon;
revoke all on table public.transfer_bookings from anon;
revoke all on table public.waitlists from anon;

grant select, insert, update on table public.transfer_settings  to authenticated;
grant select, insert, update on table public.absence_requests   to authenticated;
grant select, insert, update on table public.transfer_credits   to authenticated;
grant select, insert, update on table public.transfer_bookings  to authenticated;
grant select, insert, update on table public.waitlists          to authenticated;

grant all on table public.transfer_settings  to service_role;
grant all on table public.absence_requests   to service_role;
grant all on table public.transfer_credits   to service_role;
grant all on table public.transfer_bookings  to service_role;
grant all on table public.waitlists          to service_role;

alter table public.transfer_settings  enable row level security;
alter table public.absence_requests   enable row level security;
alter table public.transfer_credits   enable row level security;
alter table public.transfer_bookings  enable row level security;
alter table public.waitlists          enable row level security;


create policy "所属テナントの振替ルールを参照できる"
  on public.transfer_settings for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーは振替ルールを作成できる"
  on public.transfer_settings for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));

create policy "オーナーは振替ルールを更新できる"
  on public.transfer_settings for update to authenticated
  using (app.has_org_role(organization_id, array['owner']))
  with check (app.has_org_role(organization_id, array['owner']));


-- 保護者は自分の子どもの欠席連絡を出す（設計書 9章 項目10）
create policy "オーナー・スタッフ・講師、および本人の世帯は欠席連絡を参照できる"
  on public.absence_requests for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナー・スタッフ、および本人の世帯は欠席連絡を出せる"
  on public.absence_requests for insert to authenticated
  with check (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or student_id in (select app.current_student_ids())
  );


create policy "オーナー・スタッフ、および本人の世帯は振替権を参照できる"
  on public.transfer_credits for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは振替権を発行できる"
  on public.transfer_credits for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは振替権を更新できる"
  on public.transfer_credits for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナー・スタッフ・講師、および本人の世帯は振替予約を参照できる"
  on public.transfer_bookings for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or transfer_credit_id in (
      select tc.id from public.transfer_credits tc
      where tc.student_id in (select app.current_student_ids())
    )
  );

create policy "オーナーとスタッフは振替を予約できる"
  on public.transfer_bookings for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは振替予約を更新できる"
  on public.transfer_bookings for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


create policy "オーナー・スタッフ・講師はキャンセル待ちを参照できる"
  on public.waitlists for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフはキャンセル待ちを登録できる"
  on public.waitlists for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフはキャンセル待ちを更新できる"
  on public.waitlists for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));
