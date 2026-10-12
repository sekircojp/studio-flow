-- =============================================================================
-- 046: 振替権の有効期限を JST の「今日」で数える
--   設計書 2.1（表示・入力は Asia/Tokyo 固定）/ 13章（日付をまたぐ処理が JST 基準）
--
-- DB の current_date は UTC で決まる。日本時間の 0:00〜9:00 は前日になる。
--
--   submit_absence
--     振替権の有効期限を current_date から数えていた。早朝に欠席連絡を
--     出すと、期限が1日短くなる（60日のはずが59日）。
--   expire_transfer_credits（画面の「期限切れを処理」）
--     current_date と比べていたので、早朝に押すと失効が1日遅れる。
--     定期実行（移行 017）は JST で比べており、両者が食い違っていた。
--
-- ★ 移行 015 の定義から、current_date の2か所だけを
--   (now() at time zone 'Asia/Tokyo')::date に差し替えた。他は変えていない。
--   移行 017 の定期実行と同じ書き方に揃える。
-- =============================================================================

create or replace function public.submit_absence(
  p_student_id uuid,
  p_lesson_id  uuid,
  p_reason     text default null
)
returns table (granted boolean, reason_code text, expires_on date)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_lesson   public.lessons%rowtype;
  v_settings public.transfer_settings%rowtype;
  v_org      uuid;
  v_deadline timestamptz;
  v_expires  date;
  v_granted  boolean := false;
  v_code     text;
begin
  select * into v_lesson from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'lesson_not_found' using errcode = 'no_data_found';
  end if;
  v_org := v_lesson.organization_id;

  -- 保護者は自分の子どもの分だけ。管理側は自テナントの生徒すべて
  if not (
    app.has_org_role(v_org, array['owner', 'staff'])
    or p_student_id in (select app.current_student_ids())
  ) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into v_settings from public.transfer_settings where organization_id = v_org;
  if not found then
    insert into public.transfer_settings (organization_id)
    values (v_org)
    returning * into v_settings;
  end if;

  insert into public.absence_requests (
    organization_id, student_id, lesson_id, reason, submitted_by
  )
  values (v_org, p_student_id, p_lesson_id, p_reason, (select auth.uid()))
  on conflict (lesson_id, student_id) do nothing;

  -- 出欠にも「欠席」を立てておく。名簿を開いたときに分かるように
  insert into public.attendances (organization_id, lesson_id, student_id, status)
  values (v_org, p_lesson_id, p_student_id, 'absent')
  on conflict (lesson_id, student_id)
  do update set status = 'absent';

  -- 期限の判定（設計書 5.3 ①）
  v_deadline := v_lesson.start_at - make_interval(hours => v_settings.absence_deadline_hours);

  if now() > v_deadline then
    v_code := 'late_notice';
    if v_settings.grant_on_no_contact then
      v_granted := true;
    end if;
  else
    v_code := 'in_time';
    v_granted := true;
  end if;

  if v_granted then
    v_expires := ((now() at time zone 'Asia/Tokyo')::date + v_settings.credit_valid_days);

    insert into public.transfer_credits (
      organization_id, student_id, source_lesson_id, expires_at
    )
    values (v_org, p_student_id, p_lesson_id, v_expires)
    on conflict (source_lesson_id, student_id) do nothing;
  end if;

  return query select v_granted, v_code, v_expires;
end;
$fn$;


create or replace function public.expire_transfer_credits(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  with expired as (
    update public.transfer_credits
    set status = 'expired'
    where organization_id = p_organization_id
      and status = 'available'
      and expires_at < (now() at time zone 'Asia/Tokyo')::date
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$fn$;
