import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicBrand } from "@/lib/brand.server";
import { BrandMark } from "@/components/brand-mark";
import { Card } from "@/components/ui";
import { POWERED_BY } from "@/config/app";
import ApplyForm from "./apply-form";

export const metadata: Metadata = { title: "入会のお申し込み" };

/**
 * 入会申込ページ（公開・設計書 4.6）
 * ────────────────────────────────────────────────
 * ログイン不要で開ける。/apply/<スタジオの短い名前>。
 *
 * ★ 出す情報は最小限にする。
 *   誰でも開けるので、生徒の人数や空き状況のような内部の数字は出さない。
 *   クラス名だけを選択肢として並べる。
 *
 * ★ 保護者・一般向けの画面なので、補助表記は Powered by（設計書 12章）。
 */
export default async function ApplyPage({
  params,
}: PageProps<"/apply/[slug]">) {
  const { slug } = await params;

  // 未ログインの利用者が開くページなので service_role で引く。
  // 出すのはスタジオ名・ロゴ・公開クラス名だけに絞る
  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug.toLowerCase())
    .eq("status", "active")
    .maybeSingle();

  if (!org) notFound();

  const [brand, { data: classes }] = await Promise.all([
    getPublicBrand(org.id),
    supabase
      .from("classes")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("accepts_new_enrollment", true)
      .order("created_at"),
  ]);

  return (
    <main className="min-h-dvh bg-sf-bg px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <BrandMark brand={brand} size={36} maxWidth={200} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-sf-ink">
              {brand.studioName}
            </p>
            <p className="text-[12px] text-sf-muted">入会のお申し込み</p>
          </div>
        </div>

        <Card className="p-5 sm:p-7">
          <ApplyForm
            slug={slug}
            classes={(classes ?? []) as { id: string; name: string }[]}
          />
        </Card>

        {brand.terms && (
          <Card className="p-5">
            <p className="text-[13px] font-bold text-sf-ink">スタジオ規約</p>
            <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-sf-body">
              {brand.terms}
            </div>
          </Card>
        )}

        <p className="pb-4 text-center text-[11px] text-sf-muted">{POWERED_BY}</p>
      </div>
    </main>
  );
}
