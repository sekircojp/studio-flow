-- =============================================================================
-- 010: 生徒の登録（世帯・保護者を同時に作る）
--   設計書 4.3 に対応
--
-- 生徒は必ず世帯に属する。世帯は兄弟割の判定単位であり（設計書 5.5）、
-- 生徒に保護者を直接ぶら下げると兄弟をまとめられなくなる。
--
-- なぜ関数にまとめるか
--   新しい家族を登録するときは 世帯 → 保護者 → 生徒 の3件を作る。
--   これを画面側から3回に分けて呼ぶと、途中で失敗したときに
--   「生徒のいない世帯」だけが残る。households には delete を与えていないので
--   （物理削除しない方針）、その残骸は消せない。
--   1つの関数にまとめてトランザクションで扱う。
--
-- 既存の世帯に追加する場合（兄弟の入会）は p_household_id を渡す。
-- =============================================================================

create or replace function public.create_student(
  p_organization_id       uuid,
  p_name                  text,
  p_name_kana             text default null,
  p_birth_date            date default null,
  p_gender                text default null,
  p_grade                 text default null,
  p_enrolled_on           date default null,
  p_status                text default 'trial',
  p_note                  text default null,
  -- 既存の世帯に入れる場合はこちら
  p_household_id          uuid default null,
  -- 新しい世帯を作る場合はこちら
  p_household_name        text default null,
  p_guardian_name         text default null,
  p_guardian_relationship text default null,
  p_guardian_email        text default null,
  p_guardian_tel          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_household_id uuid;
  v_guardian_id  uuid;
  v_student_id   uuid;
begin
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name_required' using errcode = 'invalid_parameter_value';
  end if;

  if p_household_id is not null then
    -- 既存の世帯。他テナントの世帯を指定されていないか確認する
    select id into v_household_id
    from public.households
    where id = p_household_id and organization_id = p_organization_id;

    if v_household_id is null then
      raise exception 'household_not_found' using errcode = 'no_data_found';
    end if;
  else
    if p_household_name is null or btrim(p_household_name) = '' then
      raise exception 'household_name_required' using errcode = 'invalid_parameter_value';
    end if;

    insert into public.households (organization_id, name)
    values (p_organization_id, btrim(p_household_name))
    returning id into v_household_id;

    -- 保護者は任意。成人生徒だけの世帯もありうる
    if p_guardian_name is not null and btrim(p_guardian_name) <> '' then
      insert into public.guardians (
        organization_id, household_id, name, relationship,
        email, tel, is_billing_contact
      )
      values (
        p_organization_id, v_household_id, btrim(p_guardian_name),
        p_guardian_relationship, p_guardian_email, p_guardian_tel, true
      )
      returning id into v_guardian_id;

      -- 最初の保護者を請求の宛先にしておく
      update public.households
      set billing_guardian_id = v_guardian_id
      where id = v_household_id;
    end if;
  end if;

  insert into public.students (
    organization_id, household_id, name, name_kana,
    birth_date, gender, grade, enrolled_on, status, note
  )
  values (
    p_organization_id, v_household_id, btrim(p_name), p_name_kana,
    p_birth_date, p_gender, p_grade, p_enrolled_on,
    coalesce(p_status, 'trial'), p_note
  )
  returning id into v_student_id;

  return v_student_id;
end;
$fn$;

comment on function public.create_student is
  '生徒を登録する。新しい世帯の場合は世帯と保護者も同じトランザクションで作る（設計書 4.3）。';

revoke all on function public.create_student from public, anon;
grant execute on function public.create_student to authenticated;
