import { LogOut } from "lucide-react";
import { BrandLockup } from "@/components/brand-mark";
import { AdminMobileNav } from "@/components/admin-mobile-nav";
import { signOut } from "@/app/actions/auth";
import type { Brand } from "@/lib/brand";

/**
 * 画面上部の帯
 *
 * 大きな画面ではサイドバーがブランドを主表示するため、ここは補助に徹する。
 * 小さな画面ではサイドバーを隠すので、ここにスタジオ名を出す。
 *
 * スクロールしても上に残る。帯は半透明にぼかしを重ね（sf-glass）、
 * 下を通る内容がうっすら透けるようにする。塗りつぶすと帯の下で
 * 内容が「切れて」見える。
 *
 * 狭い幅ではサイドバーが隠れるので、左端のボタンから開閉メニューを出す。
 */
export function AdminTopBar({
  brand,
  email,
  role,
}: {
  brand: Brand;
  email: string | null;
  role: string;
}) {
  const roleLabel = role === "owner" ? "オーナー" : "スタッフ";
  const initial = (email ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sf-glass sticky top-0 z-20 flex items-center gap-3 border-b border-sf-border/70 px-4 py-3 sm:px-8">
      <AdminMobileNav brand={brand} />
      <BrandLockup
        brand={brand}
        size={26}
        maxWidth={160}
        nameClassName="text-sm font-bold text-sf-ink"
        className="lg:hidden"
      />

      <div className="ml-auto flex items-center gap-2.5">
        <div className="flex items-center gap-2.5 rounded-full border border-sf-border/80 bg-white/70 py-1 pl-1 pr-3 shadow-[0_1px_2px_rgba(23,28,53,0.04)]">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-sf-nav-soft to-sf-nav-deep text-[12px] font-bold text-white"
            aria-hidden
          >
            {initial}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-[12px] font-semibold text-sf-ink">
              {roleLabel}
            </span>
            <span className="block max-w-[180px] truncate text-[12px] text-sf-muted">
              {email}
            </span>
          </span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="ログアウト"
            className="flex size-9 items-center justify-center rounded-full border border-sf-border/80 bg-white/70 text-sf-muted transition duration-150 hover:border-sf-border-strong hover:text-sf-ink focus-visible:sf-ring"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="sr-only">ログアウト</span>
          </button>
        </form>
      </div>
    </header>
  );
}
