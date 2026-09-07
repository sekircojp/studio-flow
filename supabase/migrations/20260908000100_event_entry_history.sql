-- =============================================================================
-- 043: 発表会・イベントの出欠と参加可否の変更を記録する
--   設計書 4.6.3 / 4.9（audit_logs）
--
-- これまで event_entries は最新の値しか持っていなかった。当日つけた「出席」を
-- あとから「欠席」に書き換えても、前の値は消え、運営には分からなかった。
--
-- ★ 変更を止めるのではなく、残す。
--   当日は会場で手分けして記録するので、あとから直すのは正当な作業。
--   締めてしまうと、記録漏れを入れられなくなる。
--
-- ★ 記録は audit_logs に入れる（設計書 4.9）。
--   同じ目的の表を2つ持たない。
--
-- ★ ただし参照範囲は分ける。
--   audit_logs には請求の訂正（金額）が入っており、そちらは講師に見せない
--   （設計書 7章）。出欠の行だけを運営・講師にも開ける。
--
-- ★ 記録するのはトリガー。
--   管理画面・講師の画面・保護者の回答（answer_event_entry）と入口が3つある。
--   アプリ側で書くと、どれか1つを書き忘れたときに気づけない。
--
-- ★ 操作した人の名前を、そのとき記録する。
--   あとで講師が退職して行が消えても、「誰が変えたか」は残るべき。
--   deliveries.to_address を送信時点で残しているのと同じ考え方。
-- =============================================================================

alter table public.audit_logs add column actor_name text;

comment on column public.audit_logs.actor_name is
  '操作した人の表示名。操作した時点の名前を残す（あとで行が消えても追えるように）。';


-- -----------------------------------------------------------------------------
-- 操作した人の表示名
--
-- オーナー・スタッフには名前の置き場が無いので、ロールの名前で表す。
-- メールアドレスは出さない（名簿の画面に出す値なので）。
-- -----------------------------------------------------------------------------
create or replace function app.actor_display_name(
  p_organization_id uuid,
  p_user_id         uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_role text;
begin
  if p_user_id is null then
    return null;
  end if;

  select i.name into v_name
  from public.instructors i
  where i.user_account_id = p_user_id
    and i.organization_id = p_organization_id
  limit 1;
  if v_name is not null then
    return v_name;
  end if;

  select g.name into v_name
  from public.guardians g
  where g.user_id = p_user_id
    and g.organization_id = p_organization_id
  limit 1;
  if v_name is not null then
    return v_name;
  end if;

  select m.role into v_role
  from public.memberships m
  where m.user_id = p_user_id
    and m.organization_id = p_organization_id
  order by case m.role
    when 'owner' then 1 when 'staff' then 2 when 'instructor' then 3
    when 'guardian' then 4 else 5 end
  limit 1;

  return case v_role
    when 'owner'      then 'オーナー'
    when 'staff'      then 'スタッフ'
    when 'instructor' then '講師'
    when 'guardian'   then '保護者'
    when 'student'    then '本人'
    else null
  end;
end;
$fn$;

comment on function app.actor_display_name(uuid, uuid) is
  '操作した人の表示名。講師名・保護者名が引ければそれ、無ければロールの名前。';


-- -----------------------------------------------------------------------------
-- 出欠・参加可否が変わったら1行残す
-- -----------------------------------------------------------------------------
create or replace function app.log_event_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_actor  uuid  := (select auth.uid());
begin
  if new.status is distinct from old.status then
    v_before := v_before || jsonb_build_object('status', old.status);
    v_after  := v_after  || jsonb_build_object('status', new.status);
  end if;

  if new.attendance is distinct from old.attendance then
    v_before := v_before || jsonb_build_object('attendance', old.attendance);
    v_after  := v_after  || jsonb_build_object('attendance', new.attendance);
  end if;

  if v_after = '{}'::jsonb then
    return new;
  end if;

  insert into public.audit_logs (
    organization_id, actor_id, actor_name,
    action, target_type, target_id, before, after
  )
  values (
    old.organization_id,
    v_actor,
    app.actor_display_name(old.organization_id, v_actor),
    'event_entry.updated',
    'event_entry',
    old.id,
    v_before,
    v_after
  );

  return new;
end;
$fn$;

comment on function app.log_event_entry_change() is
  '出欠・参加可否の変更を audit_logs に残す（設計書 4.6.3）。'
  '入口が3つあるので、アプリ側ではなくトリガーで記録する。';

create trigger event_entries_log_change
  after update on public.event_entries
  for each row
  when (
    old.status is distinct from new.status
    or old.attendance is distinct from new.attendance
  )
  execute function app.log_event_entry_change();


-- -----------------------------------------------------------------------------
-- 参照範囲
--
-- 既存の「オーナーは監査ログを参照できる」はそのまま。
-- 出欠の行だけ、スタッフと講師にも開ける。記録するのは講師なので、
-- 自分がつけた記録が誰にどう直されたかを見られないのは不便すぎる。
-- 請求の訂正（金額）はこのポリシーに入らない。
-- -----------------------------------------------------------------------------
create policy "運営と講師は出欠の変更履歴を参照できる"
  on public.audit_logs for select to authenticated
  using (
    target_type = 'event_entry'
    and app.has_org_role(organization_id, array['owner', 'staff', 'instructor'])
  );

-- 名簿から履歴を引く経路（移行 020 で作成済みのため if not exists）
create index if not exists audit_logs_target_idx
  on public.audit_logs (target_type, target_id, created_at desc);
