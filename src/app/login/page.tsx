import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { devLoginEnabled } from "@/lib/auth/dev-login";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "ログイン",
};

/**
 * ログイン画面（全ロール共通）
 *
 * 設計書 7章のとおり、入口は1つ。ロールはログイン後に
 * サーバーセッションから判定して遷移先を出し分ける。
 */
export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect("/");

  // 開発用ログインの有無はサーバーで決める。クライアントで判定すると、
  // ビルドに条件が焼き込まれて本番でも枠だけ残る
  return <LoginForm devLogin={devLoginEnabled()} />;
}
