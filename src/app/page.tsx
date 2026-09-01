import Link from "next/link";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { signOut } from "@/app/actions/auth";

/**
 * トップ画面
 *
 * 現時点では、ログインが通っているかを目で確かめるための仮の画面。
 * 各ロールの画面（/admin, /staff, /my）を作ったら、
 * ここは入口の振り分けに置き換える。
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

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight">Studio Flow</h1>
        <p className="mt-2 text-sm opacity-70">
          ダンススタジオ向けのスクール運営管理サービス
        </p>

        {!session ? (
          <Link
            href="/login"
            className="mt-8 inline-block rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
          >
            ログイン
          </Link>
        ) : (
          <div className="mt-8 space-y-4 text-left">
            <div className="rounded-md border border-black/10 p-4 text-sm dark:border-white/15">
              <p className="opacity-70">ログイン中</p>
              <p className="mt-1 font-medium break-all">{session.email}</p>

              {session.memberships.length === 0 ? (
                <p className="mt-3 text-amber-700 dark:text-amber-300">
                  どのスタジオにも所属していません。
                </p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {session.memberships.map((m) => (
                    <li key={`${m.organizationId}-${m.role}`} className="opacity-80">
                      {ROLE_LABELS[m.role] ?? m.role}
                      <span className="ml-2 text-xs opacity-60">
                        → {homePathForRole(m.role)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-md border border-black/15 px-4 py-2 text-sm dark:border-white/20"
              >
                ログアウト
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
