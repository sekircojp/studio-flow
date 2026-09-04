import { requireAdmin } from "@/lib/auth/guards";
import { getBrand } from "@/lib/brand.server";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminTopBar } from "@/components/admin-topbar";

/**
 * スタジオ管理（/admin/*）の枠組み
 *
 * 設計書 12章: 管理者にはスタジオロゴ・スタジオ名を主表示し、
 * サービス名は補助表示にとどめる。
 *
 * ブランドカラーはこの要素の --sf-accent を差し替えることで反映する。
 * 各画面は sf-accent を参照するだけでよく、色の判断を持たない。
 *
 * ここでも requireAdmin() を呼ぶが、これは表示のためであって認可の本体ではない。
 * 各ページとサーバーアクションでも必ず確認する（設計書 7章）。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership, email } = await requireAdmin();
  const orgId = membership.organizationId;

  const brand = await getBrand(orgId);
  const supabase = await createClient();

  // サイドバーに出すスタジオ。アプリ層でも organization_id で絞る（設計書 3章）
  const { data: locations } = await supabase
    .from("locations")
    .select("name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("created_at");

  const list = locations ?? [];
  const locationLabel = list[0]?.name ?? "スタジオ未登録";
  const locationSubLabel =
    list.length === 0
      ? "登録してください"
      : list.length === 1
        ? "メインスタジオ"
        : `ほか ${list.length - 1} 校`;

  return (
    <div
      className="flex min-h-full flex-1 bg-sf-bg"
      style={
        brand.brandColor
          ? ({ "--sf-accent": brand.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <AdminSidebar
        brand={brand}
        locationLabel={locationLabel}
        locationSubLabel={locationSubLabel}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          brand={brand}
          email={email}
          role={membership.role}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-12 pt-2 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
