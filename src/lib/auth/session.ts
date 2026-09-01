import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ロールの判定（設計書 7章）
 * ────────────────────────────────────────────────
 * 設計書 3章の「クライアント側のロール切替は実装しない。ロールは
 * サーバーセッションから決定する」に対応する。
 *
 * 画面の出し分けだけでなく、サーバーアクションや Route Handler でも
 * ここを通して認可すること。直接 URL を叩いても越権できないようにするため。
 */

export type AppRole = "owner" | "staff" | "instructor" | "guardian" | "student";

export type Membership = {
  organizationId: string;
  role: AppRole;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  /** 所属。通常は1件。複数のスタジオに関わる保護者などは2件以上になりうる */
  memberships: Membership[];
};

/**
 * ログイン中の利用者と所属を返す。未ログインなら null。
 *
 * getSession() ではなく getUser() を使う。getSession() は Cookie の中身を
 * そのまま信じるため、サーバー側の判定に使うと偽装できてしまう。
 * getUser() は認証サーバーに問い合わせて検証する。
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS により、自分の所属行だけが返る
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    console.error("memberships の取得に失敗しました", error);
    return { userId: user.id, email: user.email ?? null, memberships: [] };
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    memberships: (data ?? []).map((row) => ({
      organizationId: row.organization_id as string,
      role: row.role as AppRole,
    })),
  };
}

/**
 * Super Admin かどうか。
 *
 * super_admins テーブルは authenticated から読めないようにしてあるため、
 * 判定には service_role が要る。/superadmin/* の入り口でだけ呼ぶこと。
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("super_admins の確認に失敗しました", error);
    return false;
  }
  return !!data;
}

/**
 * ロールごとの入り口（設計書 7章）
 *
 *   owner / staff  → /admin/*   スタジオ管理
 *   instructor     → /staff/*   担当レッスン・出欠
 *   guardian       → /my/*      自世帯のみ
 *   student        → /my/*      成人生徒。自身のみ
 *
 * 画面はまだ無いので、現時点ではトップに戻す。
 */
export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "owner":
    case "staff":
      return "/admin";
    case "instructor":
      return "/staff";
    case "guardian":
    case "student":
      return "/my";
  }
}
