import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * サーバー用の Supabase クライアント（Server Component / サーバーアクション / Route Handler）
 * ────────────────────────────────────────────────
 * anon キーを使い、ログイン中の利用者として振る舞う。
 * つまり RLS がそのまま効くので、他テナントの行は返ってこない。
 *
 * 注意: RLS は保険であって一次防御ではない（設計書 3章）。
 * このクライアントで問い合わせるときも、必ず organization_id で絞ること。
 */
export async function createClient() {
  // cookies() は環境変数の確認より先に呼ぶ。
  // これを呼んだ時点で「この画面は動的」と判定されるため、ビルド時の
  // 事前生成の対象から外れる。順序を逆にすると、環境変数が未設定の状態で
  // ビルドしたときに、この関数が事前生成中に落ちてビルドが失敗する。
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。.env.local を確認してください。",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは Cookie を書けない。
          // セッションの更新は middleware が行うので、ここは無視してよい。
        }
      },
    },
  });
}
