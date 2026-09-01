import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getBrand } from "@/lib/brand.server";
import SettingsForm from "./settings-form";
import { Card, SectionHeading } from "@/components/ui";

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
      <div className="pb-1">
        <p className="sf-kicker">Settings</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          スタジオ設定
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          ここで登録した内容が、保護者向けの画面と、保護者に届くメールの
          差出人名・返信先に使われます。
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <SectionHeading kicker="Brand" title="基本情報" />
        <div className="mt-5">
          {isOwner ? (
            <SettingsForm brand={brand} />
          ) : (
            <div className="space-y-4">
              <p className="flex items-center gap-2 rounded-xl bg-sf-warn/10 px-3 py-2.5 text-[13px] text-sf-ink">
                <Lock className="size-4 shrink-0 text-sf-warn" aria-hidden />
                スタジオ設定を変更できるのはオーナーのみです。
              </p>
              <dl className="divide-y divide-sf-border rounded-xl border border-sf-border text-[13px]">
                {[
                  ["スタジオ名", brand.studioName],
                  ["電話番号", brand.tel],
                  ["メールアドレス", brand.email],
                  ["住所", brand.address],
                  ["ウェブサイト", brand.website],
                  ["登録番号", brand.invoiceRegistrationNumber],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-4 px-4 py-2.5">
                    <dt className="w-36 shrink-0 text-sf-muted">{label}</dt>
                    <dd className="min-w-0 break-all text-sf-ink">
                      {value || "未設定"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
