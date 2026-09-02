import { redirect } from "next/navigation";
import { getSessionContext, type Membership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 講師の画面（/staff/*）の入口（設計書 7章）
 * ────────────────────────────────────────────────
 * 講師に見せてよいのは「担当レッスン、出欠、生徒一覧」まで。
 * **売上・報酬・未納は非表示。**
 *
 * その制限は RLS 側にも入れてある。請求まわりのテーブルは select ポリシーに
 * instructor を含めていないので、この画面から問い合わせても0件になる。
 * 画面を作り間違えても金額が漏れない構造にしている。
 */

export type StaffContext = {
  userId: string;
  email: string | null;
  membership: Membership;
  /** instructors の行。スタジオが登録しただけでまだ紐づいていない場合は null */
  instructor: { id: string; name: string } | null;
};

export async function requireStaff(): Promise<StaffContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const membership = session.memberships.find((m) => m.role === "instructor");
  if (!membership) redirect("/");

  const supabase = await createClient();

  // ログインしている人がどの講師なのかを引く。
  // memberships だけでは「講師ロール」までしか分からない。
  const { data } = await supabase
    .from("instructors")
    .select("id, name")
    .eq("organization_id", membership.organizationId)
    .eq("user_account_id", session.userId)
    .maybeSingle();

  return {
    userId: session.userId,
    email: session.email,
    membership,
    instructor: data ?? null,
  };
}
