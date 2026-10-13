import { requireMy } from "@/lib/auth/my";
import { getBrand } from "@/lib/brand.server";
import { brandStyle } from "@/lib/brand";
import { BrandLockup } from "@/components/brand-mark";
import { BottomNav } from "@/components/bottom-nav";
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
export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await requireMy();
  const brand = await getBrand(membership.organizationId);

  return (
    <div
      className="sf-canvas flex min-h-full flex-1 flex-col"
      style={brandStyle(brand) as React.CSSProperties | undefined}
    >
      <header className="sf-glass sticky top-0 z-20 border-b border-sf-border/70">
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
              className="rounded-full border border-sf-border/80 bg-white/70 px-3 py-1.5 text-[12px] font-medium text-sf-body transition duration-150 hover:border-sf-border-strong hover:text-sf-ink focus-visible:sf-ring"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="sf-enter mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5">
        {children}
      </main>

      {/* スマートフォンで押しやすいよう、下部に固定する */}
      <BottomNav variant="my" footer={POWERED_BY} />
    </div>
  );
}
