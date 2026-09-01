-- =============================================================================
-- 011: 在籍と出欠
--   設計書 4.4 / 5.2 に対応
--
-- 出欠を取るには「そのクラスに誰が在籍しているか」が要る。
-- enrollments が生徒とクラスを結ぶ。
-- =============================================================================

-- =============================================================================
-- enrollments: 在籍
--
-- 期間を持つ。途中入会・途中退会があり、過去にどのクラスにいたかは
-- 請求の根拠にもなるため、行を消さずに end_date で閉じる。
-- =============================================================================
create table public.enrollments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id      uuid not null,
  class_id        uuid not null,

  -- 日付だけを持つ列（設計書 2.1）
  start_date      date not null,
  end_date        date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint enrollments_period_order check (
    end_date is null or start_date <= end_date
  ),

  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,
  foreign key (class_id, organization_id)
    references public.classes (id, organization_id) on delete restrict
);

comment on table public.enrollments is '生徒のクラス在籍。退会は end_date で閉じ、行は消さない。';
comment on column public.enrollments.end_date is 'null なら在籍中。過去の在籍は請求の根拠になるので残す。';

-- 同じクラスに在籍中の行が2つできると、定員の数え方が壊れる
create unique index enrollments_active_unique_idx
  on public.enrollments (student_id, class_id)
  where end_date is null;

create index enrollments_class_idx on public.enrollments (class_id) where end_date is null;
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_organization_id_idx on public.enrollments (organization_id);

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function app.set_updated_at();


-- =============================================================================
-- attendances: 出欠
--
-- unconfirmed（未確認）を持つのは、名簿を開いた時点では
-- まだ誰も記録していない状態を、記録済みと区別するため。
-- =============================================================================
create table public.attendances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lesson_id       uuid not null,
  student_id      uuid not null,

  status          text not null default 'unconfirmed'
                    check (status in ('present', 'absent', 'late', 'unconfirmed')),

  -- 誰がいつ記録したか。代講のときに後から確認できるようにする
  recorded_by     uuid references auth.users (id) on delete set null,
  recorded_at     timestamptz,
  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (lesson_id, organization_id)
    references public.lessons (id, organization_id) on delete restrict,
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete restrict,

  -- 同じ回の同じ生徒は1行だけ
  unique (lesson_id, student_id)
);

comment on table public.attendances is '出欠。1レッスン×1生徒で1行。記録は上書きし、行は増やさない。';
comment on column public.attendances.status is
  'present 出席 / absent 欠席 / late 遅刻 / unconfirmed 未確認。'
  'unconfirmed は「まだ誰も記録していない」ことを表す。';

create index attendances_lesson_idx on public.attendances (lesson_id);
create index attendances_student_idx on public.attendances (student_id);
create index attendances_organization_id_idx on public.attendances (organization_id);

create trigger attendances_set_updated_at
  before update on public.attendances
  for each row execute function app.set_updated_at();


-- =============================================================================
-- lessons.has_attendance_record を自動で立てる
--
-- ★ 設計書 5.1 の「再生成の禁止ルール」を支える仕組み。
--   出欠が記録された回はレッスンの作り直し対象から外れるが、その判定に使う
--   フラグをアプリ側で立てる作りにすると、立て忘れた回が作り直しで消える。
--   DB 側のトリガで確実に立てる。
--
--   unconfirmed（未確認）では立てない。名簿を開いただけの回まで
--   「記録済み」になると、曜日を直したいときに作り直せなくなる。
-- =============================================================================
create or replace function app.mark_lesson_attendance_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status <> 'unconfirmed' then
    update public.lessons
    set has_attendance_record = true
    where id = new.lesson_id
      and has_attendance_record = false;
  end if;
  return new;
end;
$fn$;

create trigger attendances_mark_lesson
  after insert or update of status on public.attendances
  for each row execute function app.mark_lesson_attendance_recorded();


-- =============================================================================
-- 権限と RLS
-- =============================================================================
revoke all on table public.enrollments from anon;
revoke all on table public.attendances from anon;

grant select, insert, update on table public.enrollments to authenticated;
grant select, insert, update on table public.attendances to authenticated;

grant all on table public.enrollments to service_role;
grant all on table public.attendances to service_role;

alter table public.enrollments enable row level security;
alter table public.attendances enable row level security;


-- -----------------------------------------------------------------------------
-- enrollments
--
-- 講師は担当クラスの名簿を見る必要がある（設計書 7章）。
-- 保護者は自分の子どもの在籍だけ見える。
-- -----------------------------------------------------------------------------
create policy "オーナー・スタッフ・講師、および本人の世帯は在籍を参照できる"
  on public.enrollments for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナーとスタッフは在籍を登録できる"
  on public.enrollments for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは在籍を更新できる"
  on public.enrollments for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));


-- -----------------------------------------------------------------------------
-- attendances
--
-- 記録するのは現場の講師が中心（設計書 9章の「講師のスマートフォン優先」）。
-- 保護者は自分の子どもの出欠だけ見える。
-- -----------------------------------------------------------------------------
create policy "オーナー・スタッフ・講師、および本人の世帯は出欠を参照できる"
  on public.attendances for select to authenticated
  using (
    app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
    or student_id in (select app.current_student_ids())
  );

create policy "オーナー・スタッフ・講師は出欠を記録できる"
  on public.attendances for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']));

create policy "オーナー・スタッフ・講師は出欠を訂正できる"
  on public.attendances for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']))
  with check (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']));
