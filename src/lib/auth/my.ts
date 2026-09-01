import { redirect } from "next/navigation";
import { getSessionContext, type Membership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 保護者マイページ（/my/*）の入口（設計書 7章 / 9章 項目10）
 * ────────────────────────────────────────────────
 * 保護者は自世帯のみ、成人生徒は自身のみ。
 * 見える範囲は RLS でも絞られているが、アプリ層でも必ず絞る（設計書 3章）。
 *
 * 保護者1人が複数の子どもを切り替えて確認できること（設計書 13章）を
 * 満たすため、ここで世帯の生徒を全部返す。
 */

export type MyStudent = {
  id: string;
  name: string;
  status: string;
};

export type MyContext = {
  userId: string;
  email: string | null;
  membership: Membership;
  students: MyStudent[];
};

export async function requireMy(): Promise<MyContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const membership = session.memberships.find(
    (m) => m.role === "guardian" || m.role === "student",
  );
  if (!membership) redirect("/");

  const supabase = await createClient();

  // RLS の app.current_student_ids() により、自世帯の生徒だけが返る
  const { data } = await supabase
    .from("students")
    .select("id, name, status")
    .eq("organization_id", membership.organizationId)
    .order("created_at");

  return {
    userId: session.userId,
    email: session.email,
    membership,
    students: (data ?? []) as MyStudent[],
  };
}

/**
 * 表示対象の生徒を決める。
 * ?student= が自分の世帯の生徒でなければ、先頭の子に落とす。
 * 他人の id を渡されても、そもそも students に含まれないので選べない。
 */
export function pickStudent(
  students: MyStudent[],
  requested?: string,
): MyStudent | null {
  if (students.length === 0) return null;
  const found = requested ? students.find((s) => s.id === requested) : null;
  return found ?? students[0];
}
