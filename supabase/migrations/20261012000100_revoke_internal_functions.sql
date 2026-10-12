-- =============================================================================
-- 045: 内部でしか使わない関数を、ログイン中の利用者から呼べなくする
--   設計書 3章（テナント分離）/ 13章（直接 API を叩いても他テナントに届かない）
--
-- 分離の確認で、次の2つが別のスクールの ID を渡すと通ることが分かった。
--
--   effective_email_template(組織, 種類)
--     そのスクールが編集したメールの文面を返す。移行 041。
--   lesson_is_referenced(レッスン)
--     そのレッスンに欠席連絡・振替が付いているかを返す。移行 021。
--
-- どちらも security definer で RLS を通らないのに、呼び出し元の所属を
-- 確かめていなかった。漏れるのは文面と真偽値だけで、相手の ID（UUID）を
-- 知らないと引けないが、他テナントに届くこと自体が規約違反。
--
-- ★ 所属の確認を足すのではなく、呼べなくする。
--   アプリからは1度も呼んでいない。使っているのは render_email と
--   generate_lessons の中だけで、そちらは関数の所有者の権限で動くので、
--   ここで外しても影響しない。
--   使っていない入口に検査を足しても、検査の書き間違いが増えるだけになる。
-- =============================================================================

revoke all on function public.effective_email_template(uuid, text)
  from public, anon, authenticated;
grant execute on function public.effective_email_template(uuid, text)
  to service_role;

revoke all on function public.lesson_is_referenced(uuid)
  from public, anon, authenticated;
grant execute on function public.lesson_is_referenced(uuid)
  to service_role;
