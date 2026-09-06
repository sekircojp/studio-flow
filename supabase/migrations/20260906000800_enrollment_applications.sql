-- =============================================================================
-- 031: WEB 入会申込
--   設計書 4.6 / 9.1（フェーズ1の範囲を広げる判断は 2026-09-06）
--
-- 公開ページから保護者が申し込み、オーナーが承認すると、世帯・保護者・生徒が
-- できる。申込時に受け取ったメールアドレスがそのまま保護者の行に入るので、
-- 保護者があとから同じアドレスでログインすれば、自分の子どもに結びつく。
--
-- ★ 申込は直接 students を作らない。
--   誰でも投稿できる入口なので、いたずらや重複がそのまま名簿に入ると困る。
--   一段置いて、オーナーが見てから承認する。
--
-- ★ 名前で結びつけない。
--   「うちの子は山田花子です」という自己申告で結びつけると、名前を知って
--   いるだけで他人の子の出欠・住所・月謝が見えてしまう。
--   結びつけの鍵は、本人しか受け取れないメールアドレスにする。
--
-- ★ 公開の入口は SECURITY DEFINER の関数1つに絞る。
--   anon に insert 権限を与えると、列を自由に指定できてしまう。
--   受け取る値と、作れる行の形を関数側で固定する。
-- =============================================================================

-- 公開ページの URL に使う短い名前。/apply/step-one のようにする。
-- id をそのまま出すと URL が読めないうえ、他の画面と取り違えやすい
alter table public.organizations
  add column if not exists slug text unique
    check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$');

comment on column public.organizations.slug is
  '公開ページの URL に使う短い名前。英小文字・数字・ハイフン。';


create table public.enrollment_applications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- 生徒
  student_name       text not null,
  student_name_kana  text,
  birth_date         date,
  gender             text,
  grade              text,

  -- 保護者。メールアドレスは必須。ここが結びつけの鍵になる
  guardian_name      text not null,
  guardian_name_kana text,
  relationship       text,
  email              text not null,
  tel                text,
  address            text,

  -- 希望するクラス。無くてもよい（相談したい人もいる）
  desired_class_id   uuid,

  note            text,

  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'declined')),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users (id) on delete set null,
  decline_reason  text,
  -- 承認して作られた生徒。あとから申込と名簿を突き合わせるため
  student_id      uuid,

  created_at      timestamptz not null default now(),

  foreign key (desired_class_id, organization_id)
    references public.classes (id, organization_id) on delete set null,
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete set null,

  unique (id, organization_id)
);

comment on table public.enrollment_applications is
  'WEB 入会申込（設計書 4.6）。承認するまで名簿には入らない。';

create index enrollment_applications_org_status_idx
  on public.enrollment_applications (organization_id, status, created_at desc);


-- -----------------------------------------------------------------------------
-- 公開ページからの申込
--
-- anon から呼べる唯一の入口。作れる行の形をここで固定する。
-- -----------------------------------------------------------------------------
create or replace function public.submit_enrollment_application(
  p_slug               text,
  p_student_name       text,
  p_guardian_name      text,
  p_email              text,
  p_student_name_kana  text default null,
  p_birth_date         date default null,
  p_gender             text default null,
  p_grade              text default null,
  p_guardian_name_kana text default null,
  p_relationship       text default null,
  p_tel                text default null,
  p_address            text default null,
  p_desired_class_id   uuid default null,
  p_note               text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org_id uuid;
  v_recent integer;
  v_id     uuid;
begin
  select id into v_org_id
  from public.organizations
  where slug = lower(btrim(p_slug)) and status = 'active';

  if v_org_id is null then
    raise exception 'studio_not_found' using errcode = 'no_data_found';
  end if;

  if coalesce(btrim(p_student_name), '') = ''
     or coalesce(btrim(p_guardian_name), '') = ''
     or coalesce(btrim(p_email), '') = '' then
    raise exception 'required_missing' using errcode = 'check_violation';
  end if;

  if btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'check_violation';
  end if;

  -- 同じアドレスからの連投を止める。公開の入口なので、いたずらが
  -- そのまま溜まると承認の画面が使いものにならなくなる
  select count(*) into v_recent
  from public.enrollment_applications
  where organization_id = v_org_id
    and lower(email) = lower(btrim(p_email))
    and created_at > now() - interval '10 minutes';

  if v_recent >= 3 then
    raise exception 'too_many_submissions' using errcode = 'too_many_connections';
  end if;

  insert into public.enrollment_applications (
    organization_id, student_name, student_name_kana, birth_date, gender, grade,
    guardian_name, guardian_name_kana, relationship, email, tel, address,
    desired_class_id, note
  )
  values (
    v_org_id,
    btrim(p_student_name), nullif(btrim(coalesce(p_student_name_kana, '')), ''),
    p_birth_date, nullif(btrim(coalesce(p_gender, '')), ''),
    nullif(btrim(coalesce(p_grade, '')), ''),
    btrim(p_guardian_name), nullif(btrim(coalesce(p_guardian_name_kana, '')), ''),
    nullif(btrim(coalesce(p_relationship, '')), ''),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_tel, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    p_desired_class_id,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.submit_enrollment_application is
  '公開ページからの入会申込（設計書 4.6）。anon から呼べる唯一の入口。';

grant execute on function public.submit_enrollment_application(
  text, text, text, text, text, date, text, text, text, text, text, text, uuid, text
) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 承認。世帯・保護者・生徒を作る
-- -----------------------------------------------------------------------------
create or replace function public.approve_enrollment_application(
  p_application_id uuid,
  p_status         text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  a            public.enrollment_applications%rowtype;
  v_household  uuid;
  v_student    uuid;
begin
  select * into a from public.enrollment_applications where id = p_application_id;
  if not found then
    raise exception 'application_not_found' using errcode = 'no_data_found';
  end if;

  if not app.has_org_role(a.organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if a.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'check_violation';
  end if;

  insert into public.households (organization_id, name)
  values (a.organization_id, a.guardian_name || ' 家')
  returning id into v_household;

  -- 申込に入っていたメールアドレスをそのまま入れる。
  -- 保護者が同じアドレスでログインしたときに、ここで結びつく
  insert into public.guardians (
    organization_id, household_id, name, name_kana, relationship,
    email, tel, address, is_billing_contact
  )
  values (
    a.organization_id, v_household, a.guardian_name, a.guardian_name_kana,
    a.relationship, a.email, a.tel, a.address, true
  );

  insert into public.students (
    organization_id, household_id, name, name_kana, birth_date,
    gender, grade, enrolled_on, status, note
  )
  values (
    a.organization_id, v_household, a.student_name, a.student_name_kana,
    a.birth_date, a.gender, a.grade,
    (now() at time zone 'Asia/Tokyo')::date,
    coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'active'),
    a.note
  )
  returning id into v_student;

  -- 希望クラスがあれば、そのまま在籍にする
  if a.desired_class_id is not null then
    insert into public.enrollments (organization_id, student_id, class_id, start_date)
    values (
      a.organization_id, v_student, a.desired_class_id,
      (now() at time zone 'Asia/Tokyo')::date
    );
  end if;

  update public.enrollment_applications
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      student_id = v_student
  where id = p_application_id;

  return v_student;
end;
$fn$;

comment on function public.approve_enrollment_application(uuid, text) is
  '入会申込を承認し、世帯・保護者・生徒を作る（設計書 4.6）。'
  '申込のメールアドレスを保護者に持たせ、あとのログインで結びつくようにする。';

revoke all on function public.approve_enrollment_application(uuid, text) from public, anon;
grant execute on function public.approve_enrollment_application(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- RLS
-- 公開ページからの投稿は関数経由だけ。参照はスタジオの中の人だけ。
-- -----------------------------------------------------------------------------
alter table public.enrollment_applications enable row level security;

create policy "所属テナントの入会申込を参照できる"
  on public.enrollment_applications for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは入会申込を更新できる"
  on public.enrollment_applications for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

grant select, update on table public.enrollment_applications to authenticated;
grant all on table public.enrollment_applications to service_role;
