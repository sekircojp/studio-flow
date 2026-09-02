import Link from "next/link";
import { CalendarCheck, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { getBrand } from "@/lib/brand.server";
import { BrandMark } from "@/components/brand-mark";
import { signOut } from "@/app/actions/auth";

/**
 * 講師の画面（/staff/*）の枠組み（設計書 7章 / 12章）
 *
 * 現場のスマートフォンで開かれる前提。下部にタブを置く。
 * 設計書 12章では講師は管理者と同じ扱いなので、スタジオ名を主表示にし
 * Studio Flow を補助表示にする（Powered by は付けない）。
 */

const NAV = [
  { href: "/staff", label: "担当レッスン", icon: CalendarCheck },
  { href: "/staff/students", label: "生徒", icon: Users },
];

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership, instructor } = await requireStaff();
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
          <BrandMark brand={brand} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-sf-ink">
              {brand.studioName}
            </span>
            <span className="block text-[11px] text-sf-muted">
              {instructor ? `${instructor.name} 先生` : "講師"}
            </span>
          </span>
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
        <p className="pb-2 text-center text-[10px] text-sf-muted">Studio Flow</p>
      </nav>
    </div>
  );
}
