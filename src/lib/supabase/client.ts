import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用の Supabase クライアント
 * ────────────────────────────────────────────────
 * MarcheBase は @supabase/supabase-js を直接使い、セッションを
 * localStorage に置いていた。Studio Flow では @supabase/ssr を使い、
 * セッションを Cookie に置く。
 *
 * 理由: 設計書 3章「クライアント側のロール切替は実装しない。
 * ロールはサーバーセッションから決定する」を満たすため。
 * localStorage の中身はサーバーから読めないので、Server Component や
 * サーバーアクションで「この人は誰で、どのロールか」を判定できない。
 * Cookie なら同じセッションをサーバー側でも読める。
 *
 * ここで使うのは anon キー。RLS で守られている前提の公開値であり、
 * ブラウザに出て構わない。
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // 環境変数の入れ忘れは起動時に気づけないと、原因不明の「ログインできない」になる
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。.env.local を確認してください。",
    );
  }

  return createBrowserClient(url, anonKey);
}
