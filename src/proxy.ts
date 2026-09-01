import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * セッションの更新
 * ────────────────────────────────────────────────
 * Next.js 16 から middleware は proxy という名前になった（機能は同じ）。
 * ファイル名・関数名ともに proxy でなければ読み込まれない。
 *
 * Cookie に入っているアクセストークンは期限が短い。Server Component は
 * Cookie を書き換えられないため、期限切れの更新をここで行う。
 * これを置かないと、しばらく操作しなかった利用者が勝手にログアウトされる。
 *
 * ここではアクセス制御は行わない。ロールによる出し分けは各画面と
 * サーバーアクション側で行う（設計書 7章）。proxy だけに任せると、
 * 判定漏れがそのまま越権になる。
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 環境変数がまだ入っていない状態でも、アプリ自体は表示できるようにする
  if (!url || !anonKey) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // 呼ぶこと自体が目的。期限が近ければここで更新され、Cookie に書き戻される
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 静的ファイルと画像は除く。毎回認証サーバーに問い合わせる必要がない。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
