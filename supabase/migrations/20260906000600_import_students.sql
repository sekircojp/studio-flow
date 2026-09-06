-- =============================================================================
-- 029: 生徒の一括取り込み（CSV 移行）
--   設計書 4.3 に対応
--
-- 他社から乗り換えるときの移行用。1行＝1生徒で受け取り、世帯・保護者・
-- 在籍・月謝までを同じトランザクションで作る。
--
-- ★ 世帯は「世帯キー」で束ねる。
--   Studio Flow は世帯を持つが（兄弟割の判定単位・設計書 5.5）、他社の
--   多くは「生徒に保護者がぶら下がる」構造で世帯という概念が無い。
--   CSV 側では任意の文字列（sato-01 など）で同じ家族をまとめてもらい、
--   ここで世帯に変換する。値はこの CSV の中だけで一意ならよい。
--
-- ★ 途中で失敗したら全部戻す。
--   200行のうち137行目で落ちて「136人だけ入っている」状態が残ると、
--   どこから再開すればよいか分からなくなる。関数1つにまとめる。
--
-- ★ クラスと支払方法は既存のものと完全一致させる。ここで新規作成はしない。
--   CSV のゆらぎでクラスが増殖すると、あとの掃除が手作業になる。
--
-- 入力 p_rows は行の配列。列名は日本語ではなく英語のキーで受け取る
-- （画面側で対応付けてから渡す）。
-- =============================================================================

create or replace function public.import_students(
  p_organization_id uuid,
  p_rows            jsonb
)
returns table (
  households_created integer,
  guardians_created  integer,
  students_created   integer,
  enrollments_created integer,
  contracts_created  integer
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r              jsonb;
  v_key          text;
  v_household_id uuid;
  v_student_id   uuid;
  v_class_id     uuid;
  v_amount       integer;
  v_start        date;
  -- 世帯キー → household_id の対応表。同じキーの2人目以降は同じ世帯に入れる
  v_map          jsonb := '{}'::jsonb;
  v_households   integer := 0;
  v_guardians    integer := 0;
  v_students     integer := 0;
  v_enrollments  integer := 0;
  v_contracts    integer := 0;
begin
  -- 画面を迂回して直接呼ばれても越権できないようにする（設計書 7章）
  if not app.has_org_role(p_organization_id, array['owner', 'staff']) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required' using errcode = 'check_violation';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce(nullif(btrim(r ->> 'name'), ''), '') = '' then
      raise exception 'name_required' using errcode = 'check_violation';
    end if;

    -- 世帯キーが空なら、その生徒だけの世帯を作る
    v_key := nullif(btrim(coalesce(r ->> 'household_key', '')), '');

    if v_key is not null and v_map ? v_key then
      v_household_id := (v_map ->> v_key)::uuid;
    else
      insert into public.households (organization_id, name)
      values (p_organization_id, btrim(r ->> 'name') || ' 家')
      returning id into v_household_id;
      v_households := v_households + 1;

      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_household_id::text);
      end if;
    end if;

    -- 保護者。名前があるときだけ作る。世帯の1人目を請求先にする
    if coalesce(nullif(btrim(r ->> 'guardian_name'), ''), '') <> '' then
      insert into public.guardians (
        organization_id, household_id, name, name_kana, relationship,
        email, tel, address, emergency_contact, is_billing_contact
      )
      values (
        p_organization_id, v_household_id,
        btrim(r ->> 'guardian_name'),
        nullif(btrim(coalesce(r ->> 'guardian_name_kana', '')), ''),
        nullif(btrim(coalesce(r ->> 'relationship', '')), ''),
        nullif(btrim(coalesce(r ->> 'guardian_email', '')), ''),
        nullif(btrim(coalesce(r ->> 'guardian_tel', '')), ''),
        nullif(btrim(coalesce(r ->> 'address', '')), ''),
        nullif(btrim(coalesce(r ->> 'emergency_contact', '')), ''),
        not exists (
          select 1 from public.guardians g
          where g.household_id = v_household_id and g.is_billing_contact
        )
      );
      v_guardians := v_guardians + 1;

      -- 世帯名は請求先の姓に寄せたほうが分かりやすい
      update public.households
      set name = btrim(r ->> 'guardian_name') || ' 家'
      where id = v_household_id
        and v_guardians > 0
        and name = btrim(r ->> 'name') || ' 家';
    end if;

    insert into public.students (
      organization_id, household_id, name, name_kana, birth_date,
      gender, grade, enrolled_on, status, note
    )
    values (
      p_organization_id, v_household_id,
      btrim(r ->> 'name'),
      nullif(btrim(coalesce(r ->> 'name_kana', '')), ''),
      nullif(btrim(coalesce(r ->> 'birth_date', '')), '')::date,
      nullif(btrim(coalesce(r ->> 'gender', '')), ''),
      nullif(btrim(coalesce(r ->> 'grade', '')), ''),
      nullif(btrim(coalesce(r ->> 'enrolled_on', '')), '')::date,
      coalesce(nullif(btrim(coalesce(r ->> 'status', '')), ''), 'active'),
      nullif(btrim(coalesce(r ->> 'note', '')), '')
    )
    returning id into v_student_id;
    v_students := v_students + 1;

    -- 在籍。クラス名は既存と完全一致でなければ弾く
    if coalesce(nullif(btrim(r ->> 'class_name'), ''), '') <> '' then
      select c.id into v_class_id
      from public.classes c
      where c.organization_id = p_organization_id
        and c.name = btrim(r ->> 'class_name')
      limit 1;

      if v_class_id is null then
        raise exception 'class_not_found: %', r ->> 'class_name'
          using errcode = 'no_data_found';
      end if;

      v_start := coalesce(
        nullif(btrim(coalesce(r ->> 'enrolled_on', '')), '')::date,
        (now() at time zone 'Asia/Tokyo')::date
      );

      insert into public.enrollments (
        organization_id, student_id, class_id, start_date
      )
      values (p_organization_id, v_student_id, v_class_id, v_start);
      v_enrollments := v_enrollments + 1;
    end if;

    -- 月謝。金額があるときだけ作る
    if coalesce(nullif(btrim(r ->> 'monthly_amount'), ''), '') <> '' then
      v_amount := (r ->> 'monthly_amount')::integer;
      if v_amount < 0 then
        raise exception 'monthly_amount_negative' using errcode = 'check_violation';
      end if;

      insert into public.student_contracts (
        organization_id, student_id, monthly_amount, tax_rate,
        payment_method, start_date
      )
      values (
        p_organization_id, v_student_id, v_amount, 0.10,
        coalesce(nullif(btrim(coalesce(r ->> 'payment_method', '')), ''), 'cash'),
        coalesce(
          nullif(btrim(coalesce(r ->> 'enrolled_on', '')), '')::date,
          (now() at time zone 'Asia/Tokyo')::date
        )
      );
      v_contracts := v_contracts + 1;
    end if;
  end loop;

  return query
    select v_households, v_guardians, v_students, v_enrollments, v_contracts;
end;
$fn$;

comment on function public.import_students(uuid, jsonb) is
  'CSV からの生徒一括取り込み（設計書 4.3）。世帯・保護者・在籍・月謝までを'
  '同じトランザクションで作る。途中で失敗したら全部戻す。';

revoke all on function public.import_students(uuid, jsonb) from public, anon;
grant execute on function public.import_students(uuid, jsonb) to authenticated;
