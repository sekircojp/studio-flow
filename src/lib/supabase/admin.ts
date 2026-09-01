import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 管理用の Supabase クライアント（service_role）
 * ────────────────────────────────────────────────
 * このクライアントは RLS をバイパスする。全テナントの行が見える。
 *
 * 使ってよい場所は2つだけ:
 *   ・/superadmin/*（SaaS 運営の画面。設計書 7章）
 *   ・バッチ処理や、テナントをまたぐ運用処理
 *
 * スタジオ管理（/admin/*）や保護者マイページ（/my/*）では絶対に使わない。
 * 使った瞬間、テナント分離がアプリ層の絞り込みだけに依存することになる。
 */
export function createAdminClient() {
  // 万一クライアントバンドルに混入した場合に、実行前に気づけるようにする
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() はサーバー専用です。ブラウザから呼ぶと service_role キーが漏れます。",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env.local を確認してください。",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      // 管理用クライアントは誰のセッションも持たない
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
