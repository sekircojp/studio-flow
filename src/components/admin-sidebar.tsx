"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  ChevronRight,
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
 * 並んでいるのはフェーズ1（設計書 9章）の範囲と、あとから運営の求めで
 * 足したもの（体験申込・発表会の出欠）だけ。見込み顧客・スポットレッスン・
 * キャンセル待ち・講師報酬などは 9.1 で「やらない」と決めた機能なので、
 * 項目自体を置かない。
 *
 * まだ画面が無い項目は、リンクにせず薄く出す。押しても何も起きない
 * リンクを置くと、動かないのか壊れているのか分からなくなるため。
 *
 * 見た目（2026-10-12）
 * 濃紺は上から下へわずかに深くなる勾配にし、右端に 1px の明るい縁を
 * 置いて本文の面から一段奥にある板として見せる。選択中の項目は
 * 左にアクセント色の短い縦線を出す。塗りだけで示すと、ブランドカラーが
 * 濃紺に近いスタジオで見分けがつかなくなる。
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
      { href: "/admin/events", label: "発表会・イベント", icon: CalendarHeart },
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
    <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col bg-gradient-to-b from-sf-nav to-sf-nav-deep px-3.5 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] lg:flex">
      <BrandLockup
        brand={brand}
        size={26}
        maxWidth={196}
        className="rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-12px_rgba(0,0,0,0.6)]"
      />

      {/* スタジオの表示。スタジオをまたいだ絞り込みは、クラスを作る段階で足す */}
      <Link
        href="/admin/locations"
        className="group mt-3 flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.045] px-3 py-2.5 transition duration-150 hover:border-white/10 hover:bg-white/[0.08]"
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sf-accent text-[11px] font-bold text-sf-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          aria-hidden
        >
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
        <ChevronRight
          className="size-3.5 shrink-0 text-sf-nav-muted/70 transition group-hover:translate-x-0.5 group-hover:text-sf-nav-ink"
          aria-hidden
        />
      </Link>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
        {GROUPS.map((g, i) => (
          <div key={g.kicker || i}>
            {g.kicker && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sf-nav-muted/80">
                {g.kicker}
              </p>
            )}
            <ul className="space-y-px">
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
                      className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition duration-150 ${
                        active
                          ? "bg-white/[0.09] font-semibold text-sf-nav-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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

      <p className="px-3 pt-4 text-[10px] font-medium tracking-[0.12em] text-sf-nav-muted/60">
        {APP_NAME}
      </p>
    </aside>
  );
}
