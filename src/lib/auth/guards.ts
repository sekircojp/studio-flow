import { redirect } from "next/navigation";
import { getSessionContext, type AppRole, type Membership } from "@/lib/auth/session";

/**
 * 画面とサーバーアクションの入口で使う認可
 * ────────────────────────────────────────────────
 * 設計書 7章「画面表示の制御だけでなく、API/サーバーアクション側で必ず認可する。
 * 直接 URL を叩いても越権できないこと」に対応する。
 *
 * レイアウトで1回だけ確認する作りにはしない。Next.js のレイアウトは
 * 子ページの遷移で再実行されないことがあり、認可の穴になるため、
 * 各ページとアクションで呼ぶ。
 */

export type AdminContext = {
  userId: string;
  email: string | null;
  membership: Membership;
};

/**
 * /admin/* で使う。オーナーまたはスタッフでなければログイン画面へ送る。
 *
 * 複数スタジオに所属している場合は、最初に見つかった管理権限を使う。
 * スタジオの切り替えは、必要になった時点で明示的な UI を作る
 * （クライアント側でロールを切り替える作りにはしない・設計書 3章）。
 */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const membership = session.memberships.find(
    (m) => m.role === "owner" || m.role === "staff",
  );
  if (!membership) redirect("/");

  return { userId: session.userId, email: session.email, membership };
}

/** オーナー限定の操作で使う（スタジオ設定の変更など） */
export async function requireOwner(): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (ctx.membership.role !== "owner") redirect("/admin");
  return ctx;
}

export function isRole(membership: Membership, ...roles: AppRole[]): boolean {
  return roles.includes(membership.role);
}
