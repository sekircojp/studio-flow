import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { signOut } from "@/app/actions/auth";
import { Card, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/**
 * トップ画面
 *
 * ログイン後の行き先はロールから決める（設計書 3章・7章）。
 * まだ画面が無いロールは、ここで状態だけ見せる。
 */

const ROLE_LABELS: Record<string, string> = {
  owner: "オーナー",
  staff: "スタッフ",
  instructor: "講師",
  guardian: "保護者",
  student: "生徒",
};

export default async function Home() {
  const session = await getSessionContext();

  // ロールに対応する画面ができていれば、そのまま送る（設計書 3章・7章）
  const admin = session?.memberships.find(
    (m) => m.role === "owner" || m.role === "staff",
  );
  if (admin) redirect("/admin");

  const staff = session?.memberships.find((m) => m.role === "instructor");
  if (staff) redirect("/staff");

  const my = session?.memberships.find(
    (m) => m.role === "guardian" || m.role === "student",
  );
  if (my) redirect("/my");

  return (
    <main className="flex flex-1 items-center justify-center bg-sf-bg p-6">
      <Card className="w-full max-w-sm p-7 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-sf-ink">
          Studio Flow
        </h1>
        <p className="mt-2 text-[13px] text-sf-body">
          ダンススタジオ向けのスクール運営管理サービス
        </p>

        {!session ? (
          <Link href="/login" className={`${primaryButtonClass} mt-7 w-full py-2.5`}>
            ログイン
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <div className="mt-7 space-y-4 text-left">
            <div className="rounded-xl bg-sf-bg p-4">
              <p className="sf-kicker">Signed in</p>
              <p className="mt-1 break-all text-[13px] font-medium text-sf-ink">
                {session.email}
              </p>

              {session.memberships.length === 0 ? (
                <p className="mt-3 text-[13px] text-sf-warn">
                  どのスタジオにも所属していません。スタジオにお問い合わせください。
                </p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {session.memberships.map((m) => (
                    <li
                      key={`${m.organizationId}-${m.role}`}
                      className="text-[13px] text-sf-body"
                    >
                      {ROLE_LABELS[m.role] ?? m.role}
                      <span className="ml-2 text-[11px] text-sf-muted">
                        {homePathForRole(m.role)} は準備中です
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form action={signOut}>
              <button type="submit" className={`${secondaryButtonClass} w-full py-2`}>
                ログアウト
              </button>
            </form>
          </div>
        )}
      </Card>
    </main>
  );
}
