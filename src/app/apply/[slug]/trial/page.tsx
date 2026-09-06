import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicBrand } from "@/lib/brand.server";
import { formatShortDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { BrandMark } from "@/components/brand-mark";
import { Card } from "@/components/ui";
import { POWERED_BY } from "@/config/app";
import TrialForm, { type TrialSlot } from "./trial-form";

export const metadata: Metadata = { title: "体験・見学のお申し込み" };

/** 何日先まで出すか。遠すぎる予定は当てにならない */
const DAYS_AHEAD = 45;

/**
 * 体験・見学の申込ページ（公開・設計書 4.6 / 5.2）
 * ────────────────────────────────────────────────
 * ログイン不要で開ける。/apply/<スタジオの短い名前>/trial。
 *
 * ★ 出すのは開催日時とクラス名だけ。
 *   誰でも開けるので、在籍している生徒の人数や名前は出さない。
 *   残りわずかなときだけ「残り N」を出す。
 *
 * ★ ここに出す空き枠は目安。
 *   確定はサーバー側で、行を作るのと同じトランザクションで判定する。
 *   表示した瞬間の数字なので、他の人が先に申し込むことがある。
 */
export default async function TrialPage({
  params,
}: PageProps<"/apply/[slug]/trial">) {
  const { slug } = await params;

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug.toLowerCase())
    .eq("status", "active")
    .maybeSingle();

  if (!org) notFound();

  const today = todayInTokyo();
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + DAYS_AHEAD);

  const [brand, { data: lessons }] = await Promise.all([
    getPublicBrand(org.id),
    supabase
      .from("lessons")
      .select(
        "id, date, start_at, end_at, classes!inner(name, accepts_trial), rooms(name)",
      )
      .eq("organization_id", org.id)
      .eq("status", "scheduled")
      .eq("classes.accepts_trial", true)
      .gte("date", today)
      .lte("date", until.toISOString().slice(0, 10))
      .order("date")
      .order("start_at")
      .limit(40),
  ]);

  type Row = {
    id: string;
    date: string;
    start_at: string;
    end_at: string;
    classes: { name: string } | null;
    rooms: { name: string } | null;
  };

  const rows = (lessons ?? []) as unknown as Row[];

  // 空きは1件ずつ DB 関数に聞く。判定の式を画面側に写すと、
  // サーバー側の判定とずれたときに気付けない（設計書 5.2）
  const slots: TrialSlot[] = [];
  for (const row of rows) {
    const { data: left } = await supabase.rpc("trial_seats_left_public", {
      p_lesson_id: row.id,
    });
    const seats = typeof left === "number" ? left : 0;
    if (seats <= 0) continue;

    slots.push({
      id: row.id,
      className: row.classes?.name ?? "",
      roomName: row.rooms?.name ?? "",
      label: `${formatShortDateJa(row.date)} ${formatTimeJa(row.start_at)}–${formatTimeJa(row.end_at)}`,
      seatsLeft: seats,
    });
    if (slots.length >= 12) break;
  }

  return (
    <main className="min-h-dvh bg-sf-bg px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <BrandMark brand={brand} size={36} maxWidth={200} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-sf-ink">
              {brand.studioName}
            </p>
            <p className="text-[12px] text-sf-muted">体験・見学のお申し込み</p>
          </div>
        </div>

        <Card className="p-5 sm:p-7">
          <TrialForm slug={slug} slots={slots} />
        </Card>

        <p className="text-center text-[12px] text-sf-muted">
          入会をお決めの方は{" "}
          <Link href={`/apply/${slug}`} className="underline">
            入会のお申し込み
          </Link>
          へ
        </p>

        <p className="pb-4 text-center text-[11px] text-sf-muted">{POWERED_BY}</p>
      </div>
    </main>
  );
}
