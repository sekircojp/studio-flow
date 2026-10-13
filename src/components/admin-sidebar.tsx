"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BrandLockup } from "@/components/brand-mark";
import { AdminNavList } from "@/components/admin-nav";
import type { Brand } from "@/lib/brand";
import { APP_NAME } from "@/config/app";

/**
 * 管理画面のサイドバー（lg 以上）
 *
 * 項目の一覧は admin-nav.tsx にあり、狭い幅の開閉メニューと共用する。
 *
 * 見た目（2026-10-12）
 * 濃紺は上から下へわずかに深くなる勾配にし、右端に 1px の明るい縁を
 * 置いて本文の面から一段奥にある板として見せる。
 */
export function AdminSidebar({
  brand,
  locationLabel,
  locationSubLabel,
}: {
  brand: Brand;
  locationLabel: string;
  locationSubLabel: string;
}) {
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
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sf-accent text-[12px] font-bold text-sf-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          aria-hidden
        >
          {locationLabel.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-sf-nav-ink">
            {locationLabel}
          </span>
          <span className="block truncate text-[12px] text-sf-nav-muted">
            {locationSubLabel}
          </span>
        </span>
        <ChevronRight
          className="size-3.5 shrink-0 text-sf-nav-muted/70 transition group-hover:translate-x-0.5 group-hover:text-sf-nav-ink"
          aria-hidden
        />
      </Link>

      <div className="mt-6 flex-1 overflow-y-auto">
        <AdminNavList />
      </div>

      <p className="px-3 pt-4 text-[10px] font-medium tracking-[0.12em] text-sf-nav-muted/60">
        {APP_NAME}
      </p>
    </aside>
  );
}
