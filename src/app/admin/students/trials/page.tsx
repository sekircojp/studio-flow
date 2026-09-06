import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, MailCheck, MailWarning, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatShortDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { TrialApproval, TrialStatusSelect } from "./forms";

export const metadata: Metadata = { title: "体験・見学" };

type TrialRow = {
  id: string;
  kind: string;
  student_name: string;
  student_name_kana: string | null;
  birth_date: string | null;
  grade: string | null;
  guardian_name: string;
  email: string;
  tel: string | null;
  note: string | null;
  status: string;
  created_at: string;
  lessons: {
    date: string;
    start_at: string;
    classes: { name: string } | null;
  } | null;
};

/**
 * 体験・見学の申込（設計書 4.6 / 4.6.2）
 *
 * 公開ページから届いた申込。承認すると予約が確定し、保護者へメールが飛ぶ。
 *
 * ★ 連絡が届いたかどうかを一覧に出す。
 *   送信は非同期なので、承認した直後は「送信中」に見える。届かなかった
 *   ことに気づけないと、運営が保護者に何と答えればよいか分からなくなる
 *   （設計書 4.8）。
 */
export default async function TrialsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const { data, error } = await supabase
    .from("trials")
    .select(
      "id, kind, student_name, student_name_kana, birth_date, grade, guardian_name, email, tel, note, status, created_at, lessons(date, start_at, classes(name))",
    )
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  // 黙って空の一覧を出すと、届いた申込を見落とす
  if (error) console.error("体験申込の取得に失敗しました", error);

  const list = (data ?? []) as unknown as TrialRow[];
  const today = todayInTokyo();

  // 承認・見送りの連絡が届いたか（設計書 4.8）
  const { data: deliveryRows } = await supabase
    .from("deliveries")
    .select("trial_id, status, error")
    .eq("organization_id", membership.organizationId)
    .not("trial_id", "is", null)
    .order("created_at", { ascending: false });

  // 同じ申込に複数行あることがある（承認のあと見送りに変えた場合など）。
  // 新しい順に取ってあるので、最初に見た1件だけを残す
  const delivery = new Map<string, { status: string; error: string | null }>();
  for (const d of deliveryRows ?? []) {
    if (d.trial_id && !delivery.has(d.trial_id)) {
      delivery.set(d.trial_id, { status: d.status, error: d.error });
    }
  }

  const pending = list.filter((t) => t.status === "pending");
  const upcoming = list.filter(
    (t) => t.status === "booked" && (t.lessons?.date ?? "") >= today,
  );
  const rest = list.filter(
    (t) => !pending.includes(t) && !upcoming.includes(t),
  );

  // 連絡の結果。送るのは承認・見送りのときだけなので、それ以外には出さない
  const TrialDelivery = ({ t }: { t: TrialRow }) => {
    if (t.status !== "booked" && t.status !== "declined") return null;
    const d = delivery.get(t.id);

    if (!d) {
      return (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-sf-muted">
          <Mail className="size-3.5" aria-hidden />
          お知らせを送信中です
        </p>
      );
    }
    if (d.status === "sent") {
      return (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-sf-ok">
          <MailCheck className="size-3.5" aria-hidden />
          お知らせを送りました
        </p>
      );
    }
    return (
      <p className="mt-1.5 flex items-start gap-1 text-[11px] text-sf-danger">
        <MailWarning className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          お知らせを送れませんでした。お電話でご連絡ください
          {d.error && `（${d.error}）`}
        </span>
      </p>
    );
  };

  const Line = ({ t, approval }: { t: TrialRow; approval?: boolean }) => (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sf-ink">
          {t.student_name}
          {t.student_name_kana && (
            <span className="ml-2 text-[12px] font-normal text-sf-muted">
              {t.student_name_kana}
            </span>
          )}
          <span className="ml-2 rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-body">
            {t.kind === "observation" ? "見学" : "体験"}
          </span>
        </p>
        <p className="sf-num mt-0.5 text-[12px] text-sf-muted">
          {t.lessons
            ? `${formatShortDateJa(t.lessons.date)} ${formatTimeJa(t.lessons.start_at)} ・ ${t.lessons.classes?.name ?? ""}`
            : "（回が見つかりません）"}
          {t.grade && ` ・ ${t.grade}`}
          {t.birth_date && ` ・ ${formatDateJa(t.birth_date)}生`}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-body">
          <span>{t.guardian_name}</span>
          <span className="flex items-center gap-1">
            <Mail className="size-3.5 text-sf-muted" aria-hidden />
            {t.email}
          </span>
          {t.tel && (
            <span className="flex items-center gap-1">
              <Phone className="size-3.5 text-sf-muted" aria-hidden />
              {t.tel}
            </span>
          )}
        </p>
        {t.note && (
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-sf-muted">
            {t.note}
          </p>
        )}
        <TrialDelivery t={t} />
      </div>
      {approval ? (
        <TrialApproval trialId={t.id} />
      ) : (
        <TrialStatusSelect trialId={t.id} status={t.status} />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          生徒・保護者
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          体験・見学
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          公開ページから届いた申込です。承認すると予約が確定します。
          承認待ちの間も席は1つ押さえてあるので、見送れば空きます。
          当日の結果もここに記録してください。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading
          kicker="Pending"
          title={`承認待ち（${pending.length}）`}
          action={
            <span className="text-[12px] text-sf-muted">
              承認するまで確定しません
            </span>
          }
        />
        <div className="mt-4">
          {pending.length === 0 ? (
            <EmptyState
              title="承認待ちの申込はありません"
              description="公開ページのURLを案内すると、ここに申込が届きます。"
            />
          ) : (
            <ul className="space-y-3">
              {pending.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-sf-warn/40 bg-sf-warn/5 p-4"
                >
                  <Line t={t} approval />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Upcoming" title={`これからの回（${upcoming.length}）`} />
        <div className="mt-4">
          {upcoming.length === 0 ? (
            <EmptyState
              title="確定している体験はありません"
              description="承認した申込がここに並びます。"
            />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((t) => (
                <li key={t.id} className="rounded-xl border border-sf-border p-4">
                  <Line t={t} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {rest.length > 0 && (
        <Card className="p-5">
          <SectionHeading kicker="Past" title={`過去の申込（${rest.length}）`} />
          <ul className="mt-4 space-y-3">
            {rest.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-sf-border p-4 opacity-80"
              >
                <Line t={t} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
