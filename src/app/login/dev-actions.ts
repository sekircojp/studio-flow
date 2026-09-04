"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { devLoginEnabled } from "@/lib/auth/dev-login";

/**
 * 開発中だけ、確認コードを飛ばしてログインする
 * ────────────────────────────────────────────────
 * 構築中は、講師（maya@example.com）や保護者のような
 * 実在しないアドレスの画面を確認したいことが多い。メールが届かないので
 * 確認コード方式のままでは入れない。
 *
 * ★ 安全のため、二重に閉じている。
 *   1. NODE_ENV が production のときは絶対に動かない。
 *      Vercel のビルドは常に production なので、環境変数が誤って
 *      本番に入っても有効にならない。
 *   2. そのうえで DEV_LOGIN=1 が必要。既定では手元でも無効。
 *
 * ★ この仕組みを本番で有効にしないこと。
 *   アドレスを知っているだけで誰でもそのユーザーとしてログインできる。
 *   公開 URL で有効にすると、実質的に認証が無い状態になる。
 *
 * ログインの成立のさせ方は通常経路とまったく同じで、magic link の
 * ハッシュ済みトークンを返し、ブラウザ側で verifyOtp する。
 * 省略しているのは「コードをメールで送って照合する」部分だけ。
 */
export type DevLoginResult = { token_hash?: string; error?: string };

export async function devLogin(email: string): Promise<DevLoginResult> {
  if (!devLoginEnabled()) {
    return { error: "開発用ログインは無効です。" };
  }

  const address = email.trim().toLowerCase();
  if (!address) return { error: "メールアドレスを入力してください。" };

  const supabase = createAdminClient();

  // 既に居るユーザーだけを対象にする。ここでアカウントを作れるようにすると、
  // 手元の DB と本番の DB が同じときに、覚えのないユーザーが増える
  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: address,
  });

  if (error || !link.properties?.hashed_token) {
    console.error("開発用ログインに失敗しました", error);
    return { error: "そのアドレスのユーザーが見つかりませんでした。" };
  }

  return { token_hash: link.properties.hashed_token };
}
