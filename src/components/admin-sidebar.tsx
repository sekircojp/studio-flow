"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
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
import { BrandLockup } from "@/components/brand-mark";
import type { Brand } from "@/lib/brand";
import { APP_NAME } from "@/config/app";

/**
 * 管理画面のサイドバー
 *
 * 並んでいるのはフェーズ1（設計書 9章）の範囲だけ。
 * 見込み顧客・スポットレッスン・体験申込・キャンセル待ち・講師報酬などは
 * 9.1 で「やらない」と決めた機能なので、項目自体を置かない。
 *
 * まだ画面が無い項目は、リンクにせず薄く出す。押しても何も起きない
 * リンクを置くと、動かないのか壊れているのか分からなくなるため。
 */

type Item = {
  href: string | null;
  label: string;
  icon: typeof Users;
  badge?: number;
};

const GROUPS: { kicker: string; items: Item[] }[] = [
  {
    kicker: "",
    items: [{ href: "/admin", label: "ダッシュボード", icon: LayoutDashboard }],
  },
  {
    kicker: "Members",
    items: [{ href: "/admin/students", label: "生徒・保護者", icon: Users }],
  },
  {
    kicker: "Lessons",
    items: [
      { href: "/admin/calendar", label: "カレンダー", icon: CalendarDays },
      { href: "/admin/seasons", label: "期・休講日", icon: CalendarRange },
      { href: "/admin/classes", label: "クラス", icon: LayoutGrid },
      { href: "/admin/attendance", label: "出欠管理", icon: CheckSquare },
      { href: "/admin/transfers", label: "欠席・振替", icon: Repeat },
    ],
  },
  {
    kicker: "Team",
    items: [{ href: "/admin/instructors", label: "講師", icon: UserCog }],
  },
  {
    kicker: "Finance",
    items: [{ href: "/admin/billing", label: "月謝・請求", icon: Wallet }],
  },
  {
    kicker: "Settings",
    items: [
      { href: "/admin/locations", label: "スタジオ・ルーム", icon: Building2 },
      { href: "/admin/settings", label: "基本設定", icon: Settings },
    ],
  },
];

export function AdminSidebar({
  brand,
  locationLabel,
  locationSubLabel,
}: {
  brand: Brand;
  locationLabel: string;
  locationSubLabel: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sf-nav px-3 py-4 lg:flex">
      <BrandLockup
        brand={brand}
        size={26}
        maxWidth={192}
        className="rounded-xl bg-white px-3 py-2.5"
      />

      {/* スタジオの表示。スタジオをまたいだ絞り込みは、クラスを作る段階で足す */}
      <Link
        href="/admin/locations"
        className="mt-3 flex items-center gap-2.5 rounded-xl bg-sf-nav-soft px-3 py-2.5 transition hover:brightness-110"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sf-accent text-[11px] font-bold text-sf-accent-ink">
          {locationLabel.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-sf-nav-ink">
            {locationLabel}
          </span>
          <span className="block truncate text-[11px] text-sf-nav-muted">
            {locationSubLabel}
          </span>
        </span>
      </Link>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto">
        {GROUPS.map((g, i) => (
          <div key={g.kicker || i}>
            {g.kicker && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sf-nav-muted">
                {g.kicker}
              </p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active =
                  item.href &&
                  (item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href));

                if (!item.href) {
                  return (
                    <li key={item.label}>
                      <span
                        className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sf-nav-muted/60"
                        title="これから作る画面です"
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto text-[10px]">準備中</span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                        active
                          ? "bg-sf-nav-soft font-semibold text-sf-nav-ink"
                          : "text-sf-nav-muted hover:bg-sf-nav-soft/60 hover:text-sf-nav-ink"
                      }`}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <p className="px-3 pt-4 text-[10px] text-sf-nav-muted/70">{APP_NAME}</p>
    </aside>
  );
}
