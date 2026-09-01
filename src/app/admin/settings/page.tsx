import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { getBrand } from "@/lib/brand";
import SettingsForm from "./settings-form";

export const metadata: Metadata = { title: "スタジオ設定" };

/**
 * スタジオ設定（ブランド表示・設計書 4.1 / 12章）
 *
 * 変更できるのはオーナーだけ。スタッフには読み取り専用で見せる。
 * 保存側でも requireOwner() で確認しているため、画面を迂回しても更新できない。
 */
export default async function SettingsPage() {
  const { membership } = await requireAdmin();
  const brand = await getBrand(membership.organizationId);
  const isOwner = membership.role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">スタジオ設定</h1>
        <p className="mt-1 text-sm opacity-70">
          ここで登録した内容が、保護者向けの画面やメールの差出人に使われます。
        </p>
      </div>

      {isOwner ? (
        <SettingsForm brand={brand} />
      ) : (
        <div className="max-w-lg space-y-3">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            スタジオ設定を変更できるのはオーナーのみです。
          </p>
          <dl className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
            {[
              ["スタジオ名", brand.studioName],
              ["電話番号", brand.tel],
              ["メールアドレス", brand.email],
              ["住所", brand.address],
              ["ウェブサイト", brand.website],
              ["登録番号", brand.invoiceRegistrationNumber],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-4 px-3 py-2">
                <dt className="w-32 shrink-0 opacity-60">{label}</dt>
                <dd className="min-w-0 break-all">{value || "未設定"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
