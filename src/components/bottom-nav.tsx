"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  FileText,
  Repeat,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * スマートフォン向けの下部タブ（保護者 /my、講師 /staff）
 *
 * 親指で届く位置に置く。いま開いている画面はアクセント色で示し、上に
 * 短い線を出す。色だけだと、ブランドカラーが灰色に近いスタジオで
 * どこにいるか分からなくなる。
 *
 * 下端は端末の安全領域（ホームバーの分）だけ余白を足す。
 *
 * タブの並びはここで持つ。アイコンは React の部品で、サーバー側の
 * レイアウトから client component へ値として渡せないため。
 */

type Item = { href: string; label: string; icon: LucideIcon };

const NAVS: Record<"my" | "staff", { root: string; items: Item[] }> = {
  // 保護者マイページ（設計書 9章の 10）
  my: {
    root: "/my",
    items: [
      { href: "/my", label: "スケジュール", icon: CalendarDays },
      { href: "/my/transfers", label: "欠席・振替", icon: Repeat },
      { href: "/my/events", label: "発表会", icon: CalendarHeart },
      { href: "/my/billing", label: "月謝", icon: Wallet },
      { href: "/my/terms", label: "規約", icon: FileText },
    ],
  },
  // 講師（設計書 7章）。売上・報酬・未納は出さない
  staff: {
    root: "/staff",
    items: [
      { href: "/staff", label: "担当レッスン", icon: CalendarCheck },
      { href: "/staff/events", label: "発表会", icon: CalendarHeart },
      { href: "/staff/students", label: "生徒", icon: Users },
    ],
  },
};

export function BottomNav({
  variant,
  footer,
}: {
  variant: "my" | "staff";
  /** タブの下に出す小さな文字（Powered by など） */
  footer: string;
}) {
  const pathname = usePathname();
  // 先頭の項目は「完全一致のときだけ選択」にする。/my と /my/billing を区別するため
  const { root: rootHref, items } = NAVS[variant];

  return (
    <nav className="sf-glass fixed inset-x-0 bottom-0 z-20 border-t border-sf-border/70 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(23,28,53,0.18)]">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((n) => {
          const active =
            n.href === rootHref ? pathname === rootHref : pathname.startsWith(n.href);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[12px] transition duration-150 ${
                  active ? "font-semibold text-sf-accent" : "text-sf-body"
                }`}
              >
                {active && (
                  <span
                    className="absolute top-0 h-[2px] w-8 rounded-b-full bg-sf-accent"
                    aria-hidden
                  />
                )}
                <n.icon
                  className={`size-5 transition ${active ? "scale-105" : ""}`}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="pb-1.5 text-center text-[9.5px] tracking-[0.08em] text-sf-muted/80">
        {footer}
      </p>
    </nav>
  );
}
