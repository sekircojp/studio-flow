import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  formatDateJa,
  formatTimeJa,
  formatYen,
  todayInTokyo,
} from "@/lib/date";
import { recordEventAttendance, setEntryStatus, setEventStatus } from "../actions";
import {
  EventRoster,
  RosterNote,
  type EntryRow,
} from "@/components/event-roster";
import { AddEntries, type Candidate } from "./add-entries";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "発表会・イベント" };

/**
 * 発表会・イベントの名簿と出欠（設計書 4.6）
 *
 * 参加の可否と当日の出欠を、同じ画面で記録する。当日は会場で開くので、
 * 名簿は縦に並べてボタンを大きくしてある（出欠管理と同じ考え方）。
 */
export default async function EventDetailPage({
  params,
}: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, kind, title, venue, start_at, end_at, capacity, price, status, cancel_reason, is_public, description",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!event) notFound();

  const today = todayInTokyo();

  const [{ data: entryRows }, { data: students }, { data: enrollments }, { data: classes }] =
    await Promise.all([
      supabase
        .from("event_entries")
        .select("id, student_id, status, attendance, answered_at, students(name, name_kana)")
        .eq("event_id", id)
        .eq("organization_id", orgId),
      // 退会した生徒は名簿の候補に出さない
      supabase
        .from("students")
        .select("id, name, name_kana")
        .eq("organization_id", orgId)
        .neq("status", "withdrawn"),
      supabase
        .from("enrollments")
        .select("student_id, class_id, end_date")
        .eq("organization_id", orgId)
        .lte("start_date", today),
      supabase
        .from("classes")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
    ]);

  type RawEntry = {
    id: string;
    student_id: string;
    status: string;
    attendance: string;
    answered_at: string | null;
    students: { name: string; name_kana: string | null } | null;
  };

  const entries = ((entryRows ?? []) as unknown as RawEntry[])
    .map(
      (e): EntryRow & { studentId: string } => ({
        id: e.id,
        studentId: e.student_id,
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

  const inRoster = new Set(entries.map((e) => e.studentId));

  const classNameById = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const byStudent = new Map<string, string[]>();
  for (const e of enrollments ?? []) {
    if (e.end_date !== null && e.end_date < today) continue;
    const list = byStudent.get(e.student_id) ?? [];
    list.push(e.class_id);
    byStudent.set(e.student_id, list);
  }

  const candidates: Candidate[] = (students ?? [])
    .filter((s) => !inRoster.has(s.id))
    .map((s) => {
      const classIds = byStudent.get(s.id) ?? [];
      return {
        id: s.id,
        name: s.name,
        kana: s.name_kana,
        classIds,
        classNames: classIds
          .map((cid) => classNameById.get(cid))
          .filter((n): n is string => Boolean(n)),
      };
    })
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja"));

  const entered = entries.filter((e) => e.status === "entered").length;
  const present = entries.filter(
    (e) => e.attendance === "present" || e.attendance === "late",
  ).length;
  const unanswered = entries.filter((e) => e.status === "invited").length;

  const canceled = event.status === "canceled";
  const overCapacity =
    event.capacity != null && entered > event.capacity;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          発表会・イベント
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-sf-ink">
          {event.title}
          <span className="rounded-md bg-sf-ink/8 px-2 py-0.5 text-[12px] font-medium text-sf-body">
            {event.kind === "recital" ? "発表会" : "イベント"}
          </span>
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
            参加 {entered}
            {event.capacity != null && ` / 定員 ${event.capacity}`}
          </span>
          {event.price != null && event.price > 0 && (
            <span className="sf-num">{formatYen(event.price)}</span>
          )}
        </p>
        {event.description && (
          <p className="mt-2 max-w-2xl whitespace-pre-wrap text-[13px] leading-relaxed text-sf-body">
            {event.description}
          </p>
        )}
      </div>

      {canceled && (
        <p className="rounded-xl bg-sf-danger/10 px-4 py-3 text-[13px] text-sf-ink">
          この回は中止です。
          {event.cancel_reason && `（${event.cancel_reason}）`}
          名簿と出欠は残りますが、保護者は回答できません。
        </p>
      )}

      {!event.is_public && !canceled && (
        <p className="rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] text-sf-ink">
          保護者に公開していません。マイページには出ないので、参加の可否は
          運営が聞き取って記録することになります。
        </p>
      )}

      {overCapacity && (
        <p className="rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] text-sf-ink">
          参加する生徒が定員（{event.capacity} 人）を超えています。
        </p>
      )}

      <Card className="p-4 sm:p-5">
        <SectionHeading
          kicker="Roster"
          title={`名簿（${entries.length}）`}
          action={
            <span className="text-[12px] text-sf-muted">
              未回答 {unanswered} ・ 当日 {present} 人
            </span>
          }
        />
        <div className="mt-4">
          {entries.length === 0 ? (
            <EmptyState
              title="まだ誰も名簿に入っていません"
              description="下の「生徒を加える」から、出演する生徒を選んでください。クラス単位でまとめて選べます。"
            />
          ) : (
            <>
              <EventRoster
                entries={entries}
                disabled={canceled}
                setStatus={setEntryStatus}
                recordAttendance={recordEventAttendance}
              />
              <RosterNote />
            </>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Add" title="生徒を加える" />
        <div className="mt-4">
          <AddEntries
            eventId={event.id}
            candidates={candidates}
            classes={classes ?? []}
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Status" title="この回の状態" />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          中止にしても名簿と出欠は残ります（記録を消さないため）。保護者は
          回答できなくなります。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["planned", "予定に戻す"],
              ["held", "開催済みにする"],
              ["canceled", "中止にする"],
            ] as const
          ).map(([value, label]) => (
            <form
              key={value}
              action={async () => {
                "use server";
                await setEventStatus(event.id, value);
              }}
            >
              <button
                type="submit"
                disabled={event.status === value}
                className={`${secondaryButtonClass} ${
                  event.status === value
                    ? "border-sf-accent bg-sf-accent/5 text-sf-ink"
                    : ""
                }`}
              >
                {event.status === value ? "● " : ""}
                {label}
              </button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
