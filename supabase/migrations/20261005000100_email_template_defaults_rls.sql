-- =============================================================================
-- 044: メールの既定の文面（email_template_defaults）に RLS を入れる
--   設計書 3章（すべてのテーブルで RLS を有効化する）
--
-- 移行 041 で作ったとき、RLS の有効化が漏れていた。いまは GRANT が
-- authenticated の select だけなので実害は無いが、あとから誰かが GRANT を
-- 足したとたんに素通しになる。他の表と同じく、RLS を保険として掛けておく。
--
-- ★ organization_id は持たせない。
--   製品としての初期値で、どのスタジオにも共通。organizations と同じく
--   テナントの外側にある表として扱う。
--
-- ★ 参照はログインしていれば誰でもよい。
--   文面の編集画面（/admin/settings/emails）が直接読んでいる。
--   書き換えはマイグレーションだけで行うので、insert / update / delete の
--   ポリシーは作らない（= authenticated からは書けない）。
-- =============================================================================

revoke all on table public.email_template_defaults from anon;

alter table public.email_template_defaults enable row level security;

create policy "ログインしていれば既定の文面を参照できる"
  on public.email_template_defaults for select to authenticated
  using (true);
