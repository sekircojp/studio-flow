import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
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

  return <LoginForm />;
}
