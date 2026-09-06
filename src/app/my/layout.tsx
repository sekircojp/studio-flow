import Link from "next/link";
import { CalendarDays, FileText, Repeat, Wallet } from "lucide-react";
import { requireMy } from "@/lib/auth/my";
import { getBrand } from "@/lib/brand.server";
import { BrandLockup } from "@/components/brand-mark";
import { signOut } from "@/app/actions/auth";
import { POWERED_BY } from "@/config/app";

/**
 * 保護者マイページの枠組み（設計書 7章 / 12章）
 *
 * 保護者・生徒向けの画面ではスタジオのロゴと名前を主表示し、
 * サービス名は「Powered by」の補助表示にとどめる（設計書 12章）。
 *
 * スマートフォンで開かれる前提で、下部にタブを置く。
 */

const NAV = [
  { href: "/my", label: "スケジュール", icon: CalendarDays },
  { href: "/my/transfers", label: "欠席・振替", icon: Repeat },
  { href: "/my/billing", label: "月謝", icon: Wallet },
  { href: "/my/terms", label: "規約", icon: FileText },
];

export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await requireMy();
  const brand = await getBrand(membership.organizationId);

  return (
    <div
      className="flex min-h-full flex-1 flex-col bg-sf-bg"
      style={
        brand.brandColor
          ? ({ "--sf-accent": brand.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <header className="border-b border-sf-border bg-sf-card">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3">
          <BrandLockup
            brand={brand}
            size={28}
            maxWidth={168}
            nameClassName="text-[15px] font-bold text-sf-ink"
            className="flex-1"
          />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-sf-border px-3 py-1.5 text-[12px] text-sf-body"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-5">
        {children}
      </main>

      {/* スマートフォンで押しやすいよう、下部に固定する */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-sf-border bg-sf-card">
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((n) => (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-sf-body"
              >
                <n.icon className="size-5" aria-hidden />
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="pb-2 text-center text-[10px] text-sf-muted">
          {POWERED_BY}
        </p>
      </nav>
    </div>
  );
}
