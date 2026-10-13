import { requireStaff } from "@/lib/auth/staff";
import { getBrand } from "@/lib/brand.server";
import { brandStyle } from "@/lib/brand";
import { BrandLockup } from "@/components/brand-mark";
import { BottomNav } from "@/components/bottom-nav";
import { signOut } from "@/app/actions/auth";
import { APP_NAME } from "@/config/app";

/**
 * 講師の画面（/staff/*）の枠組み（設計書 7章 / 12章）
 *
 * 現場のスマートフォンで開かれる前提。下部にタブを置く。
 * 設計書 12章では講師は管理者と同じ扱いなので、スタジオ名を主表示にし
 * サービス名を補助表示にする（Powered by は付けない）。
 */
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership, instructor } = await requireStaff();
  const brand = await getBrand(membership.organizationId);

  return (
    <div
      className="sf-canvas sf-business flex min-h-full flex-1 flex-col"
      style={brandStyle(brand) as React.CSSProperties | undefined}
    >
      <header className="sf-glass sticky top-0 z-20 border-b border-sf-border/70">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3">
          <BrandLockup
            brand={brand}
            size={28}
            maxWidth={168}
            nameClassName="text-[15px] font-bold text-sf-ink"
            subLabel={instructor ? `${instructor.name} 先生` : "講師"}
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

      <BottomNav variant="staff" footer={APP_NAME} />
    </div>
  );
}
