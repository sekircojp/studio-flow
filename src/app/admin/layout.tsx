import Link from "next/link";
import { Building2, Home, Settings } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getBrand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { signOut } from "@/app/actions/auth";

/**
 * スタジオ管理（/admin/*）の枠組み
 *
 * 設計書 12章: 管理者にはスタジオロゴ・スタジオ名を主表示し、
 * Studio Flow は補助表示にとどめる。
 *
 * ここでも requireAdmin() を呼ぶが、これは表示のためであって認可の本体ではない。
 * 各ページとサーバーアクションでも必ず確認する（設計書 7章）。
 */

// 生徒・クラス・請求は、それぞれの画面を作る段階でここに足す
const NAV = [
  { href: "/admin", label: "ホーム", icon: Home },
  { href: "/admin/locations", label: "校舎・部屋", icon: Building2 },
  { href: "/admin/settings", label: "スタジオ設定", icon: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership, email } = await requireAdmin();
  const brand = await getBrand(membership.organizationId);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <BrandMark brand={brand} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{brand.studioName}</p>
            <p className="text-[11px] opacity-50">Studio Flow</p>
          </div>
          <span className="hidden truncate text-xs opacity-60 sm:block">
            {email}
            {membership.role === "owner" ? "（オーナー）" : "（スタッフ）"}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
            >
              ログアウト
            </button>
          </form>
        </div>

        <nav className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
