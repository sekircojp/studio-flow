import type { Metadata } from "next";
import { requireMy } from "@/lib/auth/my";
import { getBrand } from "@/lib/brand.server";
import { formatDateJa } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "スタジオ規約" };

/**
 * スタジオ規約（保護者向け・設計書 4.1）
 *
 * 運営が基本設定で登録した文章を、そのまま出す。改行は残す。
 * 空なら、この画面には何も出さずその旨だけを伝える。
 */
export default async function MyTermsPage() {
  const { membership } = await requireMy();
  const brand = await getBrand(membership.organizationId);

  return (
    <div className="space-y-5">
      <div>
        <p className="sf-kicker">Terms</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">スタジオ規約</h1>
      </div>

      <Card className="p-5">
        {brand.terms ? (
          <>
            <SectionHeading
              kicker={brand.studioName}
              title="受講にあたって"
              action={
                brand.termsUpdatedAt ? (
                  <span className="text-[12px] text-sf-muted">
                    最終更新 {formatDateJa(brand.termsUpdatedAt)}
                  </span>
                ) : undefined
              }
            />
            <div className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-sf-ink">
              {brand.terms}
            </div>
          </>
        ) : (
          <EmptyState
            title="規約はまだ登録されていません"
            description="ご不明な点は、スタジオへ直接お問い合わせください。"
          />
        )}
      </Card>
    </div>
  );
}
