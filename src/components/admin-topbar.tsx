import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { signOut } from "@/app/actions/auth";
import type { Brand } from "@/lib/brand";

/**
 * 画面上部の帯
 *
 * 大きな画面ではサイドバーがブランドを主表示するため、ここは補助に徹する。
 * 小さな画面ではサイドバーを隠すので、ここにスタジオ名を出す。
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

  return (
    <header className="flex items-center gap-3 px-5 py-4 sm:px-8">
      <div className="flex items-center gap-2 lg:hidden">
        <BrandMark brand={brand} size={26} />
        <span className="truncate text-sm font-bold text-sf-ink">
          {brand.studioName}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-[13px] font-medium text-sf-ink">{roleLabel}</p>
          <p className="text-[11px] text-sf-muted">{email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="ログアウト"
            className="flex size-9 items-center justify-center rounded-lg border border-sf-border bg-sf-card text-sf-muted transition hover:text-sf-ink"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="sr-only">ログアウト</span>
          </button>
        </form>
      </div>
    </header>
  );
}
