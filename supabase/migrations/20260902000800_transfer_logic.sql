-- =============================================================================
-- 015: 欠席連絡と振替の処理
--   設計書 5.2（定員判定）/ 5.3（振替ルール）に対応
-- =============================================================================

-- =============================================================================
-- submit_absence: 欠席連絡を出す
--
-- 期限内（レッスン開始の N 時間前まで）なら振替権を発行する。
-- 期限を過ぎた連絡と無断欠席の扱いは設定で決まる（設計書 5.3 ①⑥）。
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
    v_expires := (current_date + v_settings.credit_valid_days);

    insert into public.transfer_credits (
      organization_id, student_id, source_lesson_id, expires_at
    )
    values (v_org, p_student_id, p_lesson_id, v_expires)
    on conflict (source_lesson_id, student_id) do nothing;
  end if;

  return query select v_granted, v_code, v_expires;
end;
$fn$;

comment on function public.submit_absence(uuid, uuid, text) is
  '欠席連絡を記録し、期限内なら振替権を発行する（設計書 5.3）。';

revoke all on function public.submit_absence(uuid, uuid, text) from public, anon;
grant execute on function public.submit_absence(uuid, uuid, text) to authenticated;


-- =============================================================================
-- book_transfer: 振替を予約する
--
-- 判定は3つ（設計書 5.2 / 5.3）
--   ・振替先の範囲（同一クラス / 同ジャンル / 全クラス）
--   ・月あたりの上限回数
--   ・1レッスンの実収容上限（在籍数 + 体験数 + 振替数 < room_capacity）
--
-- 在籍が満席でも実収容上限までは受け入れられる。同時に部屋の物理的な
-- 上限を超えることもない、というのが2つの定員を持つ理由（設計書 5.2）。
-- =============================================================================
create or replace function public.book_transfer(
  p_credit_id uuid,
  p_lesson_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_credit   public.transfer_credits%rowtype;
  v_target   public.lessons%rowtype;
  v_source   public.lessons%rowtype;
  v_settings public.transfer_settings%rowtype;
  v_target_class public.classes%rowtype;
  v_source_class public.classes%rowtype;
  v_enrolled integer;
  v_transfers integer;
  v_used_this_month integer;
  v_booking_id uuid;
begin
  select * into v_credit from public.transfer_credits where id = p_credit_id;
  if not found then
    raise exception 'credit_not_found' using errcode = 'no_data_found';
  end if;

  if not app.has_org_role(v_credit.organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if v_credit.status <> 'available' then
    raise exception 'credit_not_available' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_target from public.lessons
  where id = p_lesson_id and organization_id = v_credit.organization_id;
  if not found then
    raise exception 'lesson_not_found' using errcode = 'no_data_found';
  end if;

  if v_target.status = 'canceled' then
    raise exception 'lesson_canceled' using errcode = 'invalid_parameter_value';
  end if;

  -- 有効期限（設計書 5.3 ②）
  if v_target.date > v_credit.expires_at then
    raise exception 'credit_expired' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_settings from public.transfer_settings
  where organization_id = v_credit.organization_id;
  if not found then
    insert into public.transfer_settings (organization_id)
    values (v_credit.organization_id)
    returning * into v_settings;
  end if;

  select * into v_source from public.lessons where id = v_credit.source_lesson_id;
  select * into v_target_class from public.classes where id = v_target.class_id;
  select * into v_source_class from public.classes where id = v_source.class_id;

  -- 振替先の範囲（設計書 5.3 ④）
  if v_settings.scope = 'same_class' and v_target.class_id <> v_source.class_id then
    raise exception 'scope_same_class' using errcode = 'invalid_parameter_value';
  end if;
  if v_settings.scope = 'same_genre'
     and coalesce(v_target_class.genre, '') is distinct from coalesce(v_source_class.genre, '') then
    raise exception 'scope_same_genre' using errcode = 'invalid_parameter_value';
  end if;

  -- クラス側の受入設定（設計書 5.2）
  if not v_target_class.accepts_transfer then
    raise exception 'class_rejects_transfer' using errcode = 'invalid_parameter_value';
  end if;

  -- 月あたりの上限（設計書 5.3 ③）。0 は制限なし
  if v_settings.monthly_limit > 0 then
    select count(*) into v_used_this_month
    from public.transfer_bookings tb
    join public.transfer_credits tc on tc.id = tb.transfer_credit_id
    join public.lessons l on l.id = tb.lesson_id
    where tc.student_id = v_credit.student_id
      and tb.canceled_at is null
      and date_trunc('month', l.date) = date_trunc('month', v_target.date);

    if v_used_this_month >= v_settings.monthly_limit then
      raise exception 'monthly_limit_reached' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- 1レッスンの実収容上限（設計書 5.2）
  -- 体験（trials）はフェーズ1で作らないため 0 として数える
  if v_target_class.room_capacity is not null then
    select count(*) into v_enrolled
    from public.enrollments e
    where e.class_id = v_target.class_id
      and e.start_date <= v_target.date
      and (e.end_date is null or e.end_date >= v_target.date);

    select count(*) into v_transfers
    from public.transfer_bookings tb
    where tb.lesson_id = p_lesson_id and tb.canceled_at is null;

    if (v_enrolled + v_transfers) >= v_target_class.room_capacity then
      raise exception 'room_capacity_reached' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  insert into public.transfer_bookings (organization_id, transfer_credit_id, lesson_id)
  values (v_credit.organization_id, p_credit_id, p_lesson_id)
  returning id into v_booking_id;

  update public.transfer_credits
  set status = 'used', used_at = now()
  where id = p_credit_id;

  return v_booking_id;
end;
$fn$;

comment on function public.book_transfer(uuid, uuid) is
  '振替を予約する。範囲・上限回数・実収容上限を判定する（設計書 5.2 / 5.3）。';

revoke all on function public.book_transfer(uuid, uuid) from public, anon;
grant execute on function public.book_transfer(uuid, uuid) to authenticated;


-- =============================================================================
-- expire_transfer_credits: 期限切れの振替権を閉じる
--
-- 定期実行（pg_cron）から呼ぶ想定。いまは手動でも呼べるようにしておく。
-- 行は消さず status を変えるだけ（設計書 2章）。
-- =============================================================================
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
      and expires_at < current_date
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$fn$;

revoke all on function public.expire_transfer_credits(uuid) from public, anon;
grant execute on function public.expire_transfer_credits(uuid) to authenticated;
