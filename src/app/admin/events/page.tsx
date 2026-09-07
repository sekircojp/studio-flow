import type { Metadata } from "next";
import Link from "next/link";
import { CalendarHeart, ChevronRight, MapPin, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, formatYen } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { EventForm } from "./forms";

export const metadata: Metadata = { title: "発表会・イベント" };

type EventRow = {
  id: string;
  kind: string;
  title: string;
  venue: string | null;
  start_at: string;
  end_at: string | null;
  capacity: number | null;
  price: number | null;
  status: string;
  cancel_reason: string | null;
  is_public: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  planned: "予定",
  held: "開催済み",
  canceled: "中止",
};

/**
 * 発表会・イベント（設計書 4.6）
 *
 * 出欠を取るところまでを扱う。演目・衣装・チケットは対象外（設計書 10章）。
 *
 * ★ これからの回を上に置く。
 *   運営が見るのはほとんど「次の発表会」で、過去の回は当日の出欠を
 *   あとから確認したいときだけ開く。
 */
export default async function EventsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, kind, title, venue, start_at, end_at, capacity, price, status, cancel_reason, is_public",
    )
    .eq("organization_id", orgId)
    .order("start_at", { ascending: false });

  // 黙って空の一覧を出すと、登録したものが消えたように見える
  if (error) console.error("イベントの取得に失敗しました", error);

  const list = (data ?? []) as EventRow[];

  // 名簿の人数。1件ずつ数えると回数が増えるので、まとめて引いて集計する
  const [{ data: entries }, { data: classes }] = await Promise.all([
    supabase
      .from("event_entries")
      .select("event_id, status, attendance")
      .eq("organization_id", orgId),
    supabase
      .from("classes")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
  ]);

  const counts = new Map<string, { entered: number; total: number }>();
  for (const e of entries ?? []) {
    const c = counts.get(e.event_id) ?? { entered: 0, total: 0 };
    if (e.status !== "canceled") c.total += 1;
    if (e.status === "entered") c.entered += 1;
    counts.set(e.event_id, c);
  }

  const now = new Date().toISOString();
  const upcoming = list.filter(
    (e) => e.status !== "canceled" && (e.end_at ?? e.start_at) >= now,
  );
  const past = list.filter((e) => !upcoming.includes(e));

  const Row = ({ e }: { e: EventRow }) => {
    const c = counts.get(e.id) ?? { entered: 0, total: 0 };
    return (
      <li>
        <Link
          href={`/admin/events/${e.id}`}
          className="flex items-start gap-3 rounded-xl border border-sf-border p-4 transition hover:border-sf-accent/50"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-sf-ink">
                {e.title}
              </span>
              <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-body">
                {e.kind === "recital" ? "発表会" : "イベント"}
              </span>
              {e.status !== "planned" && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                    e.status === "canceled"
                      ? "bg-sf-danger/12 text-sf-danger"
                      : "bg-sf-ok/12 text-sf-ok"
                  }`}
                >
                  {STATUS_LABEL[e.status]}
                </span>
              )}
              {!e.is_public && e.status === "planned" && (
                <span className="rounded-md bg-sf-warn/14 px-1.5 py-0.5 text-[11px] font-medium text-sf-warn">
                  未案内
                </span>
              )}
            </p>
            <p className="sf-num mt-1 text-[12px] text-sf-muted">
              {formatDateJa(e.start_at)} {formatTimeJa(e.start_at)}
              {e.end_at && `–${formatTimeJa(e.end_at)}`}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-body">
              {e.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5 text-sf-muted" aria-hidden />
                  {e.venue}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-3.5 text-sf-muted" aria-hidden />
                参加 {c.entered} / 名簿 {c.total}
                {e.capacity != null && ` ・ 定員 ${e.capacity}`}
              </span>
              {e.price != null && e.price > 0 && (
                <span className="sf-num">{formatYen(e.price)}</span>
              )}
            </p>
            {e.cancel_reason && (
              <p className="mt-1 text-[12px] text-sf-danger">
                {e.cancel_reason}
              </p>
            )}
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-sf-muted" aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Events</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          発表会・イベント
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          出演者・参加者の名簿を作り、参加の可否と当日の出欠を記録します。
          保護者に公開すると、マイページから出欠を答えてもらえます。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading
          kicker="Upcoming"
          title={`これからの予定（${upcoming.length}）`}
        />
        <div className="mt-4">
          {upcoming.length === 0 ? (
            <EmptyState
              title="これからの予定はありません"
              description="下のフォームから、発表会やイベントを登録してください。"
            />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading
          kicker="New"
          title="発表会・イベントを登録する"
          action={
            <CalendarHeart className="size-5 text-sf-muted" aria-hidden />
          }
        />
        <div className="mt-5">
          <EventForm classes={classes ?? []} />
        </div>
      </Card>

      {past.length > 0 && (
        <Card className="p-5">
          <SectionHeading kicker="Past" title={`過去・中止（${past.length}）`} />
          <ul className="mt-4 space-y-3">
            {past.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
