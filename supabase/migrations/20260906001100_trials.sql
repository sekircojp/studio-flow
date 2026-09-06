-- =============================================================================
-- 034: 体験・見学の申込
--   設計書 4.6 / 5.2
--
-- 公開ページから、ログインせずに体験レッスンを申し込めるようにする。
-- 入会申込と違い、体験は「どの回に出るか」が決まっているので lessons に
-- 紐づく。定員の判定もその回に対して行う（設計書 5.2）。
--
--   体験受入可否:
--     (その回の在籍数 + 体験数 + 振替数) < room_capacity
--     AND accepts_trial = true
--
-- ★ 定員の判定は、行を作るのと同じトランザクションで行う。
--   公開の入口なので、2人が同時に最後の1枠へ申し込むことがある。
--   画面で「空きあり」と出したあとに確定するのでは間に合わない。
--
-- ★ leads（見込み顧客）は作らない。
--   設計書 9.1 で見込み顧客管理は対象外のまま。体験の申込そのものが
--   名簿の役割を果たすので、いまは trials だけで足りる。必要になったら
--   lead_id を足す（列を増やすだけで済む形にしてある）。
--
-- ★ 承認は要らない。
--   入会申込と違い、体験は「その回に来てもらう」だけで、名簿には入らない。
--   定員に空きがあるなら、その場で確定してよい。運営は当日の名簿で見る。
-- =============================================================================

create table public.trials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lesson_id       uuid not null,

  -- trial 体験（レッスンに参加する） / observation 見学（見るだけ）
  kind            text not null default 'trial'
                    check (kind in ('trial', 'observation')),

  student_name       text not null,
  student_name_kana  text,
  birth_date         date,
  grade              text,

  guardian_name   text not null,
  email           text not null,
  tel             text,
  note            text,

  -- booked 予約済み / attended 参加した / no_show 来なかった
  -- enrolled 入会した / declined 見送り / canceled 取り消し
  status          text not null default 'booked'
                    check (status in ('booked', 'attended', 'no_show',
                                      'enrolled', 'declined', 'canceled')),
  -- 体験後の手ごたえ。運営のメモ
  intent          text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict,

  -- 同じ回に同じアドレスで二重に申し込ませない
  unique (lesson_id, email)
);

comment on table public.trials is
  '体験・見学の申込（設計書 4.6）。公開ページから受け付ける。';

create index trials_org_status_idx
  on public.trials (organization_id, status, created_at desc);
create index trials_lesson_idx on public.trials (lesson_id);


-- -----------------------------------------------------------------------------
-- 体験を受け入れられる回か（設計書 5.2）
--
-- room_capacity が未設定なら上限なしとして扱う。小規模なスタジオは
-- 定員を入れずに運用することがある。
-- -----------------------------------------------------------------------------
create or replace function app.trial_seats_left(p_lesson_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when c.room_capacity is null then 999
    else greatest(
      c.room_capacity
      - (select count(*) from public.enrollments e
          where e.class_id = l.class_id
            and e.start_date <= l.date
            and (e.end_date is null or e.end_date >= l.date))
      - (select count(*) from public.trials t
          where t.lesson_id = l.id and t.status in ('booked', 'attended'))
      - (select count(*) from public.transfer_bookings tb
          where tb.lesson_id = l.id and tb.canceled_at is null),
      0)
  end
  from public.lessons l
  join public.classes c on c.id = l.class_id
  where l.id = p_lesson_id;
$fn$;

comment on function app.trial_seats_left(uuid) is
  'その回にあと何人受け入れられるか（設計書 5.2）。'
  'room_capacity が未設定なら上限なしとして扱う。';


-- -----------------------------------------------------------------------------
-- 公開ページからの体験申込
-- -----------------------------------------------------------------------------
create or replace function public.submit_trial_application(
  p_slug              text,
  p_lesson_id         uuid,
  p_student_name      text,
  p_guardian_name     text,
  p_email             text,
  p_kind              text default 'trial',
  p_student_name_kana text default null,
  p_birth_date        date default null,
  p_grade             text default null,
  p_tel               text default null,
  p_note              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org_id uuid;
  l        public.lessons%rowtype;
  c        public.classes%rowtype;
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

  -- その回が自テナントのもので、まだ開催前か
  select * into l from public.lessons
  where id = p_lesson_id and organization_id = v_org_id;
  if not found then
    raise exception 'lesson_not_found' using errcode = 'no_data_found';
  end if;
  if l.status <> 'scheduled' then
    raise exception 'lesson_not_open' using errcode = 'check_violation';
  end if;
  if l.date < (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'lesson_past' using errcode = 'check_violation';
  end if;

  select * into c from public.classes where id = l.class_id;
  if not c.accepts_trial then
    raise exception 'trial_not_accepted' using errcode = 'check_violation';
  end if;

  -- ★ 空きの判定はここで行う。画面で見せた時点の数字は当てにならない
  if app.trial_seats_left(p_lesson_id) <= 0 then
    raise exception 'lesson_full' using errcode = 'check_violation';
  end if;

  -- いたずらの連投を止める
  select count(*) into v_recent
  from public.trials
  where organization_id = v_org_id
    and lower(email) = lower(btrim(p_email))
    and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then
    raise exception 'too_many_submissions' using errcode = 'too_many_connections';
  end if;

  insert into public.trials (
    organization_id, lesson_id, kind,
    student_name, student_name_kana, birth_date, grade,
    guardian_name, email, tel, note
  )
  values (
    v_org_id, p_lesson_id,
    case when p_kind = 'observation' then 'observation' else 'trial' end,
    btrim(p_student_name),
    nullif(btrim(coalesce(p_student_name_kana, '')), ''),
    p_birth_date,
    nullif(btrim(coalesce(p_grade, '')), ''),
    btrim(p_guardian_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_tel, '')), ''),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.submit_trial_application is
  '公開ページからの体験・見学の申込（設計書 4.6 / 5.2）。'
  '定員の判定を同じトランザクションで行う。';

grant execute on function public.submit_trial_application(
  text, uuid, text, text, text, text, text, date, text, text, text
) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.trials enable row level security;

create policy "所属テナントの体験申込を参照できる"
  on public.trials for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは体験申込を登録できる"
  on public.trials for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは体験申込を更新できる"
  on public.trials for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

grant select, insert, update on table public.trials to authenticated;
grant all on table public.trials to service_role;
