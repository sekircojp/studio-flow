import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getBrand } from "@/lib/brand.server";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionHeading } from "@/components/ui";
import { TemplateEditor, type TemplateItem } from "./editor";

export const metadata: Metadata = { title: "メールの文面" };

/**
 * 見本の値
 *
 * プレビューで使う。実データを引くと、その生徒の名前が固定で出てしまい、
 * 「なぜこの子なのか」と気を取られる。見本だと分かる名前にする。
 */
function samples(studioName: string): Record<string, Record<string, string>> {
  return {
    invoice_issued: {
      保護者名: "見本 花子",
      生徒名: "見本 さくら",
      対象月: "2026年12月",
      請求金額: "10,800円（税込）",
      支払期限: "12月27日",
      スクール名: studioName,
    },
    trial_approved: {
      保護者名: "見本 花子",
      生徒名: "見本 さくら",
      種別: "体験",
      クラス: "KIDS HIPHOP 初級",
      日時: "9月15日(火) 16:00〜17:00",
      会場: "岡崎スタジオ メインルーム",
      住所: "愛知県岡崎市○○町1-2-3",
      電話: "0564-83-8005",
      スクール名: studioName,
    },
    trial_declined: {
      保護者名: "見本 花子",
      生徒名: "見本 さくら",
      種別: "体験",
      日時: "9月15日(火) 16:00〜17:00",
      電話: "0564-83-8005",
      スクール名: studioName,
    },
    event_invited: {
      保護者名: "見本 花子",
      生徒名: "見本 さくら",
      種類: "発表会",
      イベント名: "第1回 発表会",
      日時: "11月3日(火) 13:00〜16:00",
      会場: "岡崎市民会館 あおいホール",
      参加費: "3,000円（12月分の月謝と一緒にご請求します）",
      参加費の補足: "衣装代を含みます",
      回答期限: "10月10日(土) 23:59 まで",
      マイページURL: "https://app.example.com/my/events",
      案内文: "当日は12時30分に会場入口へお集まりください。",
      スクール名: studioName,
    },
  };
}

/**
 * メールの文面（設計書 11章）
 *
 * ★ ログインの確認コードは並べない。
 *   認証そのもので、文面を壊すと誰もログインできなくなる。フィッシングに
 *   見える文面へ書き換えられる余地も作らない（移行 041）。
 *
 * 変更できるのはオーナーだけ。スタッフには読み取りで見せる。
 */
export default async function EmailTemplatesPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;
  const brand = await getBrand(orgId);
  const isOwner = membership.role === "owner";

  const [{ data: defaults }, { data: custom }] = await Promise.all([
    supabase
      .from("email_template_defaults")
      .select("kind, label, note, subject, body, placeholders")
      .order("kind"),
    supabase
      .from("email_templates")
      .select("kind, subject, body")
      .eq("organization_id", orgId),
  ]);

  const customByKind = new Map(
    (custom ?? []).map((t) => [t.kind, t] as const),
  );

  const sample = samples(brand.studioName || "○○スタジオ");

  // 運営が読む順に並べる。日々目にするものから
  const ORDER = [
    "invoice_issued",
    "event_invited",
    "trial_approved",
    "trial_declined",
  ];

  const items: TemplateItem[] = (defaults ?? [])
    .map((d) => {
      const mine = customByKind.get(d.kind);
      return {
        kind: d.kind,
        label: d.label,
        note: d.note,
        subject: mine?.subject ?? d.subject,
        body: mine?.body ?? d.body,
        isCustom: Boolean(mine),
        placeholders: d.placeholders ?? [],
        sample: sample[d.kind] ?? {},
      };
    })
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          基本設定
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          メールの文面
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          保護者へ届くメールの件名と本文です。差出人の名前はスクール名、
          返信先は基本設定のメールアドレスになります。
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-sf-bg px-4 py-3 text-[13px] leading-relaxed text-sf-body">
        <Lock className="mt-0.5 size-4 shrink-0 text-sf-muted" aria-hidden />
        ログインの確認コードのメールは変更できません。文面が壊れると誰も
        ログインできなくなるためです。
      </p>

      {!isOwner && (
        <p className="flex items-center gap-2 rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] text-sf-ink">
          <Lock className="size-4 shrink-0 text-sf-warn" aria-hidden />
          文面を変更できるのはオーナーのみです。
        </p>
      )}

      {items.map((item) => (
        <Card key={item.kind} className="p-5 sm:p-6">
          <SectionHeading
            kicker="Mail"
            title={item.label}
            action={
              item.isCustom ? (
                <span className="rounded-md bg-sf-accent/12 px-2 py-0.5 text-[11px] font-medium text-sf-accent">
                  編集済み
                </span>
              ) : (
                <Mail className="size-4 text-sf-muted" aria-hidden />
              )
            }
          />
          <p className="mt-1 text-[12px] text-sf-muted">{item.note}</p>
          <div className="mt-5">
            {isOwner ? (
              <TemplateEditor item={item} />
            ) : (
              <div className="rounded-xl border border-sf-border p-4">
                <p className="text-[13px] font-bold text-sf-ink">
                  {item.subject}
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-sf-body">
                  {item.body}
                </pre>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
