-- =============================================================================
-- 039: 発表会・イベントの見直し
--   設計書 4.6.3（移行 038 の続き）
--
-- 運営から出た指摘に合わせて直す。
--
--  1. 回答期限を持たせる
--  2. 「誰に案内するか」を持たせる（全体 / クラス指定 / 個別）
--  3. 保護者の答えに「保留」を足す
--  4. 当日の出欠から「遅刻」を外す
--  5. 参加費の集め方をスタジオごとに選べるようにする
--  6. 案内メールの送信記録を持てるようにする
--
-- ★ 「未回答」は状態として残すが、ボタンは画面から外す。
--   参加にも不参加にも押していなければ未回答である、というのは見れば分かる。
--   押せる選択肢として並べると、答えを消すための操作が1つ増えるだけになる。
--   運営が誤って押した場合に備え、値そのものは残す。
--
-- ★ 「遅刻」を外す。
--   学校ではないので、発表会に何分遅れたかを記録しても使い道がない。
--   既存の遅刻は出席に寄せる（来たことに変わりはないため）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 / 2 / 5: events に列を足す
-- -----------------------------------------------------------------------------
alter table public.events
  -- 保護者が出欠を答える期限。衣装の発注や座席の都合で必ず要る
  add column answer_deadline_at timestamptz,

  -- 誰に案内するか
  --   all      在籍者全員
  --   classes  指定したクラスの在籍者
  --   selected 個別に選ぶ
  add column audience text not null default 'selected'
    check (audience in ('all', 'classes', 'selected')),

  -- 参加費の集め方。スタジオによって違う
  --   none          徴収しない
  --   on_site       当日、会場で集める（もっとも多い）
  --   with_tuition  翌月の月謝と一緒に集める
  --   bank_transfer 事前に振り込んでもらう
  --   other         その他（fee_note に書く）
  add column fee_collection text not null default 'on_site'
    check (fee_collection in
      ('none', 'on_site', 'with_tuition', 'bank_transfer', 'other')),
  add column fee_note text,

  -- 案内メールを最後に送った日時。送ったかどうかを画面に出すために持つ
  add column invited_at timestamptz;

comment on column public.events.answer_deadline_at is
  '保護者が出欠を答えられる期限。過ぎると答えられなくなる（設計書 4.6.3）。';
comment on column public.events.audience is
  'all 在籍者全員 / classes 指定クラス / selected 個別。名簿を作るときの母集団。';
comment on column public.events.fee_collection is
  '参加費の集め方。当日徴収がもっとも多いが、スタジオによって違う。';


-- -----------------------------------------------------------------------------
-- 2: 案内先のクラス
--
-- audience = 'classes' のときだけ使う。クラスは複数選べる。
-- -----------------------------------------------------------------------------
create table public.event_target_classes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id        uuid not null,
  class_id        uuid not null,

  created_at      timestamptz not null default now(),

  foreign key (event_id, organization_id)
    references public.events (id, organization_id) on delete cascade,
  foreign key (class_id, organization_id)
    references public.classes (id, organization_id) on delete restrict,

  unique (event_id, class_id)
);

comment on table public.event_target_classes is
  'イベントの案内先クラス（設計書 4.6.3）。audience = classes のときに使う。';

create index event_target_classes_event_idx
  on public.event_target_classes (event_id);


-- -----------------------------------------------------------------------------
-- 3: 保護者の答えに「保留」を足す
-- -----------------------------------------------------------------------------
alter table public.event_entries drop constraint event_entries_status_check;
alter table public.event_entries add constraint event_entries_status_check
  check (status in ('invited', 'entered', 'undecided', 'declined', 'canceled'));

comment on column public.event_entries.status is
  'invited 未回答 / entered 参加 / undecided 保留 / declined 不参加 / canceled 取消。'
  '未回答はボタンとして出さない（押していなければ未回答だと分かるため）。';


-- -----------------------------------------------------------------------------
-- 4: 当日の出欠から「遅刻」を外す
--
-- 既存の遅刻は出席に寄せる。来たことに変わりはない。
-- -----------------------------------------------------------------------------
update public.event_entries set attendance = 'present' where attendance = 'late';

alter table public.event_entries drop constraint event_entries_attendance_check;
alter table public.event_entries add constraint event_entries_attendance_check
  check (attendance in ('present', 'absent', 'unconfirmed'));

comment on column public.event_entries.attendance is
  'present 出席 / absent 欠席 / unconfirmed 未記録。'
  '遅刻は持たない。学校ではないので、何分遅れたかに使い道がない。';


-- 案内メールの宛先として参照するため
alter table public.event_entries
  add constraint event_entries_id_organization_id_key unique (id, organization_id);


-- -----------------------------------------------------------------------------
-- 3: 保護者の回答を、3択＋期限つきにする
--
-- 引数が boolean から text に変わるので、古いほうは落とす。
-- -----------------------------------------------------------------------------
drop function if exists public.answer_event_entry(uuid, boolean);

create or replace function public.answer_event_entry(
  p_entry_id uuid,
  p_answer   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  e public.event_entries%rowtype;
  v public.events%rowtype;
begin
  if p_answer not in ('entered', 'undecided', 'declined') then
    raise exception 'invalid_answer' using errcode = 'check_violation';
  end if;

  select * into e from public.event_entries where id = p_entry_id;
  if not found then
    raise exception 'entry_not_found' using errcode = 'no_data_found';
  end if;

  -- 自分の世帯の生徒か。画面を迂回して呼ばれても、他人の子どもは答えられない
  if e.student_id not in (select app.current_student_ids()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  -- 運営が取り消した行には答えさせない
  if e.status = 'canceled' then
    raise exception 'entry_canceled' using errcode = 'check_violation';
  end if;

  select * into v from public.events where id = e.event_id;
  if v.status <> 'planned' then
    raise exception 'event_closed' using errcode = 'check_violation';
  end if;
  if not v.is_public then
    raise exception 'event_not_public' using errcode = 'check_violation';
  end if;

  -- 期限を過ぎたら答えられない。過ぎたあとの変更は運営が聞き取って入れる
  if v.answer_deadline_at is not null and v.answer_deadline_at < now() then
    raise exception 'deadline_passed' using errcode = 'check_violation';
  end if;

  -- 期限が無い場合は開催時刻を期限とみなす
  if v.answer_deadline_at is null and v.start_at < now() then
    raise exception 'event_past' using errcode = 'check_violation';
  end if;

  update public.event_entries
  set status      = p_answer,
      answered_at = now(),
      answered_by = (select auth.uid())
  where id = p_entry_id;
end;
$fn$;

comment on function public.answer_event_entry(uuid, text) is
  '保護者が参加・保留・不参加を答える（設計書 4.6.3）。'
  '触れるのは status だけ。当日の出欠は運営・講師しか記録できない。';

revoke all on function public.answer_event_entry(uuid, text) from public, anon;
grant execute on function public.answer_event_entry(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2: 案内先から名簿を作る
--
-- audience に従って、まだ名簿にいない生徒を足す。
--
-- ★ すでにいる生徒には触れない。
--   もう一度実行しても、答え済みの返事が「未回答」に戻らないようにする。
--
-- ★ 在籍の判定は開催日で行う。
--   いま在籍していても、開催日までに退会が決まっている生徒は出演しない。
-- -----------------------------------------------------------------------------
create or replace function public.build_event_roster(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v      public.events%rowtype;
  v_date date;
  v_added integer;
begin
  select * into v from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  if not app.has_org_role(v.organization_id, array['owner', 'staff']) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  -- 個別に選ぶ設定なら、ここでは何もしない（画面から1人ずつ足す）
  if v.audience = 'selected' then
    return 0;
  end if;

  v_date := (v.start_at at time zone 'Asia/Tokyo')::date;

  insert into public.event_entries (
    organization_id, event_id, student_id, amount
  )
  select v.organization_id, v.id, s.id, v.price
  from public.students s
  where s.organization_id = v.organization_id
    and s.status <> 'withdrawn'
    and (
      v.audience = 'all'
      or exists (
        select 1
        from public.enrollments e
        join public.event_target_classes t
          on t.class_id = e.class_id and t.event_id = v.id
        where e.student_id = s.id
          and e.start_date <= v_date
          and (e.end_date is null or e.end_date >= v_date)
      )
    )
    and not exists (
      select 1 from public.event_entries ee
      where ee.event_id = v.id and ee.student_id = s.id
    );

  get diagnostics v_added = row_count;
  return v_added;
end;
$fn$;

comment on function public.build_event_roster(uuid) is
  '案内先の設定から名簿を作る（設計書 4.6.3）。すでにいる生徒には触れない。';

revoke all on function public.build_event_roster(uuid) from public, anon;
grant execute on function public.build_event_roster(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 6: 案内メールの送信記録
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('invoice_issued', 'trial_approved', 'trial_declined',
                  'event_invited'));

alter table public.deliveries
  add column event_entry_id uuid,
  add constraint deliveries_event_entry_id_organization_id_fkey
    foreign key (event_entry_id, organization_id)
    references public.event_entries (id, organization_id) on delete cascade;

create index deliveries_event_entry_idx on public.deliveries (event_entry_id);

comment on column public.deliveries.event_entry_id is
  'イベントの案内メール（設計書 4.6.3）。宛先は世帯の請求先保護者。';

-- 同じ案内を二度送らない。送り直したいときは status が sent 以外の行が残る
create unique index deliveries_sent_once_per_event_entry
  on public.deliveries (event_entry_id, channel)
  where event_entry_id is not null and status = 'sent';


-- -----------------------------------------------------------------------------
-- 6: 案内メールを Edge Function に依頼する
--
-- 移行 028（請求のお知らせ）と同じ形。鍵と URL は Vault から読む。
-- 未設定でも案内そのものは止めない。送信の呼び出しだけを飛ばす。
-- -----------------------------------------------------------------------------
create or replace function app.request_event_invites(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text := app.secret('project_url');
  v_key text := app.secret('service_role_key');
begin
  if v_url is null or v_key is null then
    raise warning 'event invite skipped: project_url または service_role_key が Vault にありません';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-event-invite',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('event_id', p_event_id),
    timeout_milliseconds := 20000
  );
end;
$fn$;

comment on function app.request_event_invites(uuid) is
  'イベントの案内メール送信を Edge Function に依頼する（設計書 4.6.3）。';


-- 保護者へ案内する（公開する＋案内メールを送る）
create or replace function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v public.events%rowtype;
begin
  select * into v from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  if not app.has_org_role(v.organization_id, array['owner', 'staff']) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  update public.events
  set is_public = true, invited_at = now()
  where id = p_event_id;

  perform app.request_event_invites(p_event_id);
end;
$fn$;

comment on function public.publish_event(uuid) is
  'イベントを保護者に公開し、案内メールを送る（設計書 4.6.3）。'
  '送信は非同期。結果は deliveries に残る。';

revoke all on function public.publish_event(uuid) from public, anon;
grant execute on function public.publish_event(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 9: 保護者が自分の子どもの採寸を登録する
--   設計書 4.3（採寸は履歴形式）
--
-- ★ 衣装はイベントに紐づけない。
--   発表会のたびに測り直すのではなく、保護者がいつでも更新できる形にする。
--   イベント側から見たいときは、そのときの最新値を引けばよい。
--
-- ★ 上書きではなく履歴として積む。
--   子どもは成長するので、いつ時点の数値かが分からないと使えない（設計書 4.3）。
--
-- ★ 保護者に insert 権限そのものは渡さない。
--   student_id を自由に指定されると他人の子どもの行を作れる。
--   自世帯かどうかをこの関数の中で確かめる。
-- -----------------------------------------------------------------------------
create or replace function public.record_measurement(
  p_student_id uuid,
  p_height     numeric default null,
  p_wear_size  text    default null,
  p_shoe_size  numeric default null,
  p_note       text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid;
  v_id  uuid;
begin
  if p_student_id not in (select app.current_student_ids()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  if p_height is null and coalesce(btrim(p_wear_size), '') = ''
     and p_shoe_size is null and coalesce(btrim(p_note), '') = '' then
    raise exception 'nothing_to_record' using errcode = 'check_violation';
  end if;

  select organization_id into v_org
  from public.students where id = p_student_id;

  insert into public.student_measurements (
    organization_id, student_id, measured_at,
    height, wear_size, shoe_size, note
  )
  values (
    v_org, p_student_id, (now() at time zone 'Asia/Tokyo')::date,
    p_height,
    nullif(btrim(coalesce(p_wear_size, '')), ''),
    p_shoe_size,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.record_measurement is
  '保護者が自分の子どもの採寸を登録する（設計書 4.3）。履歴として積む。';

revoke all on function public.record_measurement(uuid, numeric, text, numeric, text)
  from public, anon;
grant execute on function public.record_measurement(uuid, numeric, text, numeric, text)
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLS: event_target_classes
-- -----------------------------------------------------------------------------
revoke all on table public.event_target_classes from anon;
grant select, insert, delete on table public.event_target_classes to authenticated;
grant all on table public.event_target_classes to service_role;

alter table public.event_target_classes enable row level security;

create policy "運営と講師は案内先クラスを参照できる"
  on public.event_target_classes for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff', 'instructor']));

create policy "オーナーとスタッフは案内先クラスを登録できる"
  on public.event_target_classes for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

-- 案内先の選び直しは、行を消して入れ直す。業務の記録ではなく設定なので、
-- ここは物理削除でよい（CLAUDE.md の「状態変更で表す」は業務データの話）
create policy "オーナーとスタッフは案内先クラスを外せる"
  on public.event_target_classes for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));
