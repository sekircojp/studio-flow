import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  MailCheck,
  MailWarning,
  MapPin,
  Users,
  Wallet,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  formatDateJa,
  formatTimeJa,
  formatYen,
  todayInTokyo,
} from "@/lib/date";
import {
  recordEventAttendance,
  setEntryStatus,
  setEventStatus,
} from "../actions";
import {
  EventRoster,
  RosterNote,
  type EntryRow,
} from "@/components/event-roster";
import { AddEntries, type Candidate } from "./add-entries";
import { PublishEvent, RebuildRoster } from "./publish";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "発表会・イベント" };

const AUDIENCE_LABEL: Record<string, string> = {
  all: "在籍者全員",
  classes: "指定したクラス",
  selected: "個別に選ぶ",
};

const FEE_LABEL: Record<string, string> = {
  none: "徴収しない",
  on_site: "当日、会場で集める",
  with_tuition: "翌月の月謝と一緒に集める",
  bank_transfer: "事前に振り込んでもらう",
  other: "その他",
};

/**
 * 発表会・イベントの名簿と出欠（設計書 4.6.3）
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
      "id, kind, title, venue, start_at, end_at, answer_deadline_at, capacity, price, audience, fee_collection, fee_note, status, cancel_reason, is_public, invited_at, description",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!event) notFound();

  const today = todayInTokyo();

  const [
    { data: entryRows },
    { data: students },
    { data: enrollments },
    { data: classes },
    { data: targetClasses },
  ] = await Promise.all([
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
    supabase
      .from("event_target_classes")
      .select("class_id")
      .eq("event_id", id)
      .eq("organization_id", orgId),
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

  // 案内メールが届いたか（設計書 4.8）
  const { data: deliveryRows } = await supabase
    .from("deliveries")
    .select("event_entry_id, status, error")
    .eq("organization_id", orgId)
    .in("event_entry_id", entries.length > 0 ? entries.map((e) => e.id) : ["-"]);

  let mailSent = 0;
  let mailFailed = 0;
  const mailError = new Set<string>();
  for (const d of deliveryRows ?? []) {
    if (d.status === "sent") mailSent += 1;
    else {
      mailFailed += 1;
      if (d.error) mailError.add(d.error);
    }
  }

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
  const undecided = entries.filter((e) => e.status === "undecided").length;
  const declined = entries.filter((e) => e.status === "declined").length;
  const unanswered = entries.filter((e) => e.status === "invited").length;
  const present = entries.filter((e) => e.attendance === "present").length;

  const canceled = event.status === "canceled";
  const overCapacity = event.capacity != null && entered > event.capacity;
  const targetNames = (targetClasses ?? [])
    .map((t) => classNameById.get(t.class_id))
    .filter((n): n is string => Boolean(n));

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
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-muted">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            回答期限{" "}
            {event.answer_deadline_at
              ? `${formatDateJa(event.answer_deadline_at)} ${formatTimeJa(event.answer_deadline_at)}`
              : "指定なし（開催時刻まで）"}
          </span>
          <span className="flex items-center gap-1">
            <Wallet className="size-3.5" aria-hidden />
            {event.price != null && event.price > 0
              ? `${formatYen(event.price)}・${FEE_LABEL[event.fee_collection]}`
              : "参加費なし"}
            {event.fee_note && `（${event.fee_note}）`}
          </span>
          <span>案内先: {AUDIENCE_LABEL[event.audience]}</span>
          {targetNames.length > 0 && <span>{targetNames.join("・")}</span>}
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

      {overCapacity && (
        <p className="rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] text-sf-ink">
          参加する生徒が定員（{event.capacity} 人）を超えています。
        </p>
      )}

      <Card className="p-5">
        <SectionHeading
          kicker="Invite"
          title="保護者への案内"
          action={
            event.invited_at ? (
              <span className="text-[12px] text-sf-muted">
                {formatDateJa(event.invited_at)} に案内
              </span>
            ) : (
              <span className="text-[12px] text-sf-warn">まだ案内していません</span>
            )
          }
        />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          押すと保護者のマイページに出て、出欠のお願いのメールが届きます。
          すでに答えた保護者と、すでに送った宛先には飛びません。
        </p>
        <div className="mt-4 space-y-3">
          <PublishEvent
            eventId={event.id}
            invitedAt={event.invited_at}
            unanswered={unanswered}
            disabled={canceled || event.status !== "planned"}
          />
          {(mailSent > 0 || mailFailed > 0) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1 text-sf-ok">
                <MailCheck className="size-3.5" aria-hidden />
                送信済み {mailSent}
              </span>
              {mailFailed > 0 && (
                <span className="flex items-center gap-1 text-sf-danger">
                  <MailWarning className="size-3.5" aria-hidden />
                  送れず {mailFailed}
                  {mailError.size > 0 && `（${[...mailError].join(" / ")}）`}
                </span>
              )}
            </p>
          )}
          {event.audience !== "selected" && <RebuildRoster eventId={event.id} />}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionHeading
          kicker="Roster"
          title={`名簿（${entries.length}）`}
          action={
            <span className="text-[12px] text-sf-muted">
              参加 {entered} ・ 保留 {undecided} ・ 不参加 {declined} ・ 未回答{" "}
              {unanswered}
            </span>
          }
        />
        <div className="mt-4">
          {entries.length === 0 ? (
            <EmptyState
              title="まだ誰も名簿に入っていません"
              description={
                event.audience === "selected"
                  ? "下の「生徒を加える」から、出演する生徒を選んでください。クラス単位でまとめて選べます。"
                  : "「名簿を作り直す」を押すと、案内先の設定から名簿ができます。"
              }
            />
          ) : (
            <>
              <p className="mb-3 text-[12px] text-sf-muted">
                当日の出席 {present} 人
              </p>
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
        <SectionHeading
          kicker="Add"
          title="生徒を加える"
          action={
            <span className="text-[12px] text-sf-muted">
              案内先から漏れた生徒を個別に足せます
            </span>
          }
        />
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
