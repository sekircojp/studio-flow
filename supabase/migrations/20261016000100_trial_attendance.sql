-- =============================================================================
-- 048: 体験の生徒の出欠を、担当講師からも付けられるようにする
--   設計書 4.4 / 5.1（名簿に振替・体験の生徒を載せる。2026-10-16）
--
-- 出欠の名簿に、その回に振替で来る生徒と体験の生徒も載せる。振替の生徒は
-- students の行があるので attendances にそのまま記録できる。体験の生徒は
-- 入会前で students に行が無く、出欠は trials.status（attended / no_show）
-- で表す。
--
-- trials の update は owner / staff にしか与えていない（移行 029）。講師は
-- 現場で出欠を付ける人なので、担当している回の体験に限って状態を変えられる
-- 必要がある。列を自由に書けないよう、関数に閉じる。
-- =============================================================================

create or replace function public.record_trial_attendance(
  p_trial_id uuid,
  p_status   text    -- attended 来た / no_show 来なかった / booked 記録を消す
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  t public.trials%rowtype;
begin
  if p_status not in ('attended', 'no_show', 'booked') then
    raise exception 'invalid_status' using errcode = 'check_violation';
  end if;

  select * into t from public.trials where id = p_trial_id;
  if not found then
    raise exception 'trial_not_found' using errcode = 'no_data_found';
  end if;

  -- 承認前・見送り・取消・入会済みの申込は、出欠の対象ではない
  if t.status not in ('booked', 'attended', 'no_show') then
    raise exception 'trial_not_attendable' using errcode = 'check_violation';
  end if;

  -- 運営か、その回を担当している講師だけ（設計書 7章）
  if not (
    app.has_org_role(t.organization_id, array['owner', 'staff'])
    or (
      app.has_org_role(t.organization_id, array['instructor'])
      and exists (
        select 1
        from public.lesson_instructors li
        join public.instructors i on i.id = li.instructor_id
        where li.lesson_id = t.lesson_id
          and i.organization_id = t.organization_id
          and i.user_account_id = auth.uid()
      )
    )
  ) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.trials
  set status = p_status
  where id = p_trial_id;
end;
$fn$;

comment on function public.record_trial_attendance(uuid, text) is
  '体験の生徒の出欠（attended / no_show）。担当講師も付けられる。booked で記録を消す。';

revoke all on function public.record_trial_attendance(uuid, text) from public, anon;
grant execute on function public.record_trial_attendance(uuid, text) to authenticated;
