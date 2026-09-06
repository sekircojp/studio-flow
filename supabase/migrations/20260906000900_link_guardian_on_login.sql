-- =============================================================================
-- 032: ログインした人を、同じメールアドレスの保護者に結びつける
--   設計書 4.3 / 7章
--
-- WEB 入会申込で受け取ったメールアドレスは guardians.email に入っている。
-- 保護者が同じアドレスでログインしたら、その行と結びつけて
-- 保護者ロールの所属を作る。
--
-- ★ 結びつけの鍵はメールアドレスだけにする。
--   名前や生年月日で突き合わせると、それを知っているだけで他人の子の
--   出欠・住所・月謝が見える。メールアドレスは、受信できる本人しか
--   使えないので、確認コード方式のログインがそのまま本人確認になる。
--
-- ★ 既に誰かに結びついている行は触らない。
--   同じアドレスが2つの保護者行に入っていた場合、後から来た人が
--   先の人の世帯を奪うことになる。
--
-- ★ 呼ぶのはログイン直後だけ。auth.uid() の本人にしか作用しない。
-- =============================================================================

create or replace function public.link_guardian_by_email()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  g         record;
  v_linked  integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_email is null or v_email = '' then
    return 0;
  end if;

  -- 同じアドレスの保護者行。まだ誰にも結びついていないものだけ
  for g in
    select id, organization_id
    from public.guardians
    where lower(email) = v_email and user_id is null
  loop
    update public.guardians
    set user_id = v_user_id, updated_at = now()
    where id = g.id and user_id is null;

    insert into public.memberships (organization_id, user_id, role)
    values (g.organization_id, v_user_id, 'guardian')
    on conflict do nothing;

    v_linked := v_linked + 1;
  end loop;

  return v_linked;
end;
$fn$;

comment on function public.link_guardian_by_email() is
  'ログイン中の利用者を、同じメールアドレスの保護者に結びつける（設計書 4.3）。'
  '結びつけの鍵はメールアドレスだけ。名前では突き合わせない。';

revoke all on function public.link_guardian_by_email() from public, anon;
grant execute on function public.link_guardian_by_email() to authenticated;
