-- =============================================================================
-- 003: メール確認コードによるログイン
--   設計書 2章（認証はメール確認コード方式・パスワード不要）/ 10.5（MarcheBase から移植）
--
-- Supabase 標準の OTP メールは使わない。差出人の表示名をスタジオごとに
-- 変えられないためで、設計書 11章の「From の表示名にスタジオ名」を
-- 満たすには自前でコードを発行して Resend から送る必要がある。
--
-- 移植元: MarcheBase の email_verifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- email_verifications
--
-- ★ organization_id を nullable にしている点について
--
--   CLAUDE.md の絶対条件は「organizations 以外の全業務テーブルに
--   organization_id を必須列で持たせる」だが、この表だけは例外にしている。
--   ログイン画面でコードを送る時点では、まだ本人確認が済んでおらず、
--   そのアドレスがどのスタジオの関係者なのかを確定できないため。
--   （確定できるように振る舞うと、アドレスを入れ替えるだけで
--     「誰がこのスタジオに登録しているか」を外部から調べられてしまう）
--
--   これは業務データではなく認証の基盤テーブルであり、
--   anon / authenticated には権限を一切与えず service_role からしか
--   触れないため、テナント間の漏れは発生しない。
--
--   入会申込などスタジオが特定できる経路から呼ぶ場合は、差出人の表示名に
--   スタジオ名を使うために organization_id を入れる。
-- -----------------------------------------------------------------------------
create table public.email_verifications (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  organization_id uuid references public.organizations (id) on delete set null,

  -- コードそのものは保存しない。sha256("<email>:<code>") だけを持つ
  code_hash       text not null,
  expires_at      timestamptz not null,

  -- 6桁は総当たりで100万通りしかないため、試行回数を必ず数える
  attempts        integer not null default 0 check (attempts >= 0),

  -- 使用済み・無効化した時刻。null のものだけが有効
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.email_verifications is 'ログイン用のメール確認コード。service_role（Edge Function）からのみ読み書きする。';
comment on column public.email_verifications.code_hash is 'sha256("<email>:<code>")。平文のコードは保存しない。';
comment on column public.email_verifications.organization_id is '差出人の表示名にスタジオ名を使う場合のみ入る。ログイン経路では null。';

-- 最新の未使用コードを引く経路と、連投チェックの経路
create index email_verifications_lookup_idx
  on public.email_verifications (email, created_at desc);

create index email_verifications_active_idx
  on public.email_verifications (email, created_at desc)
  where consumed_at is null;


-- -----------------------------------------------------------------------------
-- 権限: service_role のみ。anon / authenticated には一切与えない
-- -----------------------------------------------------------------------------
revoke all on table public.email_verifications from anon, authenticated;
grant all on table public.email_verifications to service_role;

-- ポリシーを1つも作らない = service_role 以外からは常に0行
alter table public.email_verifications enable row level security;


-- =============================================================================
-- find_user_id_by_email
--
-- 確認コードが通ったあと、そのアドレスの auth.users を引く必要がある。
-- Supabase の管理 API（listUsers）にはメールでの絞り込みが無く、
-- 全件を取得して探す実装になりがちだが、利用者が増えると破綻する。
-- auth.users.email には索引があるので、ここを直接引く。
--
-- ★ app スキーマではなく public に置いている理由
--   Edge Function からは supabase.rpc() で呼ぶ。PostgREST は公開スキーマの
--   関数しか呼べず、app スキーマは公開していないため public に置く必要がある。
--   その代わり、実行権限は service_role だけに絞る。
--
--   PostgreSQL は新しい関数の EXECUTE を既定で PUBLIC に与えるので、
--   revoke を書き忘れると誰でも呼べてしまう。下の revoke は必須。
-- =============================================================================
create or replace function public.find_user_id_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.id
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;
$fn$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

comment on function public.find_user_id_by_email(text) is
  'メールアドレスから auth.users.id を引く。service_role 専用（Edge Function の verify-code から呼ぶ）。';

grant usage on schema app to service_role;
