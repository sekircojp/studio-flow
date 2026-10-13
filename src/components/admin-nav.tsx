"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  LayoutGrid,
  CheckSquare,
  LayoutDashboard,
  Repeat,
  Settings,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

/**
 * 管理画面のメニュー項目（サイドバーと、狭い幅の開閉メニューで共用）
 *
 * 並んでいるのはフェーズ1（設計書 9章）の範囲と、あとから運営の求めで
 * 足したもの（体験申込・発表会の出欠）だけ。見込み顧客・スポットレッスン・
 * キャンセル待ち・講師報酬などは 9.1 で「やらない」と決めた機能なので、
 * 項目自体を置かない。
 *
 * 選択中の項目は左にアクセント色の短い縦線を出す。塗りだけで示すと、
 * ブランドカラーが濃紺に近いスタジオで見分けがつかなくなる。
 */

type Item = {
  href: string;
  label: string;
  icon: typeof Users;
};

export const ADMIN_NAV_GROUPS: { kicker: string; items: Item[] }[] = [
  {
    kicker: "",
    items: [{ href: "/admin", label: "ダッシュボード", icon: LayoutDashboard }],
  },
  {
    kicker: "生徒",
    items: [{ href: "/admin/students", label: "生徒・保護者", icon: Users }],
  },
  {
    kicker: "レッスン",
    items: [
      { href: "/admin/calendar", label: "カレンダー", icon: CalendarDays },
      { href: "/admin/seasons", label: "期・休講日", icon: CalendarRange },
      { href: "/admin/classes", label: "クラス", icon: LayoutGrid },
      { href: "/admin/attendance", label: "出欠管理", icon: CheckSquare },
      { href: "/admin/transfers", label: "欠席・振替", icon: Repeat },
      { href: "/admin/events", label: "発表会・イベント", icon: CalendarHeart },
    ],
  },
  {
    kicker: "講師",
    items: [{ href: "/admin/instructors", label: "講師", icon: UserCog }],
  },
  {
    kicker: "月謝",
    items: [{ href: "/admin/billing", label: "月謝・請求", icon: Wallet }],
  },
  {
    kicker: "設定",
    items: [
      { href: "/admin/locations", label: "スタジオ・ルーム", icon: Building2 },
      { href: "/admin/settings", label: "基本設定", icon: Settings },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/** メニューの一覧そのもの。濃紺の面の上に置く前提の色 */
export function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-6" aria-label="管理メニュー">
      {ADMIN_NAV_GROUPS.map((g, i) => (
        <div key={g.kicker || i}>
          {g.kicker && (
            <p className="px-3 pb-2 text-[11px] font-semibold text-sf-nav-muted/80">
              {g.kicker}
            </p>
          )}
          <ul className="space-y-px">
            {g.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                      active
                        ? "bg-white/[0.09] font-semibold text-sf-nav-ink"
                        : "text-sf-nav-muted hover:bg-white/[0.05] hover:text-sf-nav-ink"
                    }`}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-sf-accent"
                        aria-hidden
                      />
                    )}
                    <item.icon
                      className={`size-4 shrink-0 ${active ? "text-sf-accent" : ""}`}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
