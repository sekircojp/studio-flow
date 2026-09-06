import { createClient } from "@/lib/supabase/server";

/**
 * ログイン中の利用者を、同じメールアドレスの保護者に結びつける
 * ────────────────────────────────────────────────
 * 実処理は DB 関数 link_guardian_by_email()。guardians.user_id を埋め、
 * 保護者ロールの所属を作る。
 *
 * ★ 結びつけの鍵はメールアドレスだけ。
 *   名前や生年月日で突き合わせると、それを知っているだけで他人の子どもの
 *   出欠・住所・月謝が見えてしまう。メールアドレスは受信できる本人しか
 *   使えないので、確認コード方式のログインがそのまま本人確認になる。
 *
 * ★ 既に誰かに結びついている保護者の行は触らない（関数側で担保）。
 *
 * 失敗しても画面は止めない。結びつかなければ「所属がありません」と
 * 出るだけで、危険な側に倒れることはない。
 */
export async function linkGuardianByEmail(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_guardian_by_email");

  if (error) {
    console.error("保護者の結びつけに失敗しました", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
