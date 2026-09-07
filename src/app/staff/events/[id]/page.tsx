import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa } from "@/lib/date";
import { EventRoster, type EntryRow } from "@/components/event-roster";
import { fetchEntryChanges } from "@/lib/event-changes";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { recordEventAttendanceAsStaff } from "../actions";

export const metadata: Metadata = { title: "発表会・イベント" };

/**
 * 講師の発表会・イベント名簿（設計書 4.6 / 9章 項目6）
 *
 * ★ 出せるのは当日の出欠だけ。
 *   誰を出すか（参加可否）は運営の判断で、当日の会場で変えるものではない。
 *   休講の判断を講師の画面から外しているのと同じ考え方。
 *
 * ★ 参加しないと決まっている生徒は名簿に出さない。
 *   会場で見るのは「今日ここに来るはずの人」の一覧。不参加の生徒まで
 *   並ぶと、目で追う数が倍になる。
 */
export default async function StaffEventDetailPage({
  params,
}: PageProps<"/staff/events/[id]">) {
  const { id } = await params;
  const { membership } = await requireStaff();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: event } = await supabase
    .from("events")
    .select("id, kind, title, venue, start_at, end_at, status, cancel_reason, description")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!event) notFound();

  const { data: entryRows } = await supabase
    .from("event_entries")
    .select("id, status, attendance, answered_at, students(name, name_kana)")
    .eq("event_id", id)
    .eq("organization_id", orgId);

  type RawEntry = {
    id: string;
    status: string;
    attendance: string;
    answered_at: string | null;
    students: { name: string; name_kana: string | null } | null;
  };

  const entries = ((entryRows ?? []) as unknown as RawEntry[])
    .filter((e) => e.status !== "declined" && e.status !== "canceled")
    .map(
      (e): EntryRow => ({
        id: e.id,
        studentName: e.students?.name ?? "（生徒不明）",
        studentKana: e.students?.name_kana ?? null,
        status: e.status as EntryRow["status"],
        attendance: e.attendance as EntryRow["attendance"],
        answeredAt: e.answered_at,
      }),
    )
    .sort((a, b) =>
      (a.studentKana ?? a.studentName).localeCompare(
        b.studentKana ?? b.studentName,
        "ja",
      ),
    );

  // 変更履歴（移行 043）。記録するのは講師なので、講師にも見せる
  const changes = await fetchEntryChanges(
    supabase,
    membership.organizationId,
    entries.map((e) => e.id),
  );

  const canceled = event.status === "canceled";
  const done = entries.filter((e) => e.attendance !== "unconfirmed").length;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/staff/events"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          発表会・イベント
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-sf-ink">
          {event.title}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-sf-body">
          <span className="sf-num">
            {formatDateJa(event.start_at)} {formatTimeJa(event.start_at)}
            {event.end_at && `–${formatTimeJa(event.end_at)}`}
          </span>
          {event.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5 text-sf-muted" aria-hidden />
              {event.venue}
            </span>
          )}
          <span className="flex items-center gap-1 text-sf-muted">
            <Users className="size-3.5" aria-hidden />
            {done} / {entries.length} 人 記録済み
          </span>
        </p>
        {event.description && (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-sf-body">
            {event.description}
          </p>
        )}
      </div>

      {canceled && (
        <p className="rounded-xl bg-sf-danger/10 px-4 py-3 text-[13px] text-sf-ink">
          この回は中止です。
          {event.cancel_reason && `（${event.cancel_reason}）`}
        </p>
      )}

      <Card className="p-3 sm:p-4">
        <SectionHeading kicker="Roster" title={`名簿（${entries.length}）`} />
        <div className="mt-4">
          {entries.length === 0 ? (
            <EmptyState
              title="出席予定の生徒がいません"
              description="スタジオが名簿を作ると、ここに表示されます。"
            />
          ) : (
            <EventRoster
              entries={entries}
              changes={changes}
              disabled={canceled}
              recordAttendance={recordEventAttendanceAsStaff}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
