import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, MapPin, MessageSquareOff, Repeat } from "lucide-react";
import { pickStudent, requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { StudentSwitch } from "@/components/student-switch";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "スケジュール" };

type LessonRow = {
  id: string;
  date: string;
  start_at: string;
  end_at: string;
  status: string;
  cancel_reason: string | null;
  class_id: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
};

/**
 * 保護者のスケジュール（設計書 9章 項目10）
 *
 * 休講もそのまま表示する。個別の連絡を不要にするため（設計書 5.1）。
 *
 * 2026-10-13
 *   ・各回から「欠席を連絡」へ進める。生徒と回を選び直させない
 *   ・連絡済みの回には「欠席連絡済み」を出す
 *   ・スタジオが予約した振替先の回も、通常の回と並べて出す（「振替」の札付き）。
 *     取り消した予約は出さない。在籍クラスの回と重なれば1行にまとめる
 */
export default async function MySchedulePage({
  searchParams,
}: PageProps<"/my">) {
  const { membership, students } = await requireMy();
  const params = await searchParams;
  const requested = typeof params.student === "string" ? params.student : undefined;
  const student = pickStudent(students, requested);

  if (!student) {
    return (
      <EmptyState
        title="表示できる生徒がいません"
        description="スタジオにお問い合わせください。"
      />
    );
  }

  const supabase = await createClient();
  const today = todayInTokyo();

  const orgId = membership.organizationId;

  // 在籍しているクラス、欠席連絡、振替の予約（取り消していないもの）
  const [{ data: enrollments }, { data: absences }, { data: bookings }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("class_id, start_date, end_date")
        .eq("student_id", student.id)
        .eq("organization_id", orgId),
      supabase
        .from("absence_requests")
        .select("lesson_id")
        .eq("student_id", student.id)
        .eq("organization_id", orgId),
      supabase
        .from("transfer_bookings")
        .select("lesson_id, transfer_credits!inner(student_id)")
        .eq("organization_id", orgId)
        .eq("transfer_credits.student_id", student.id)
        .is("canceled_at", null),
    ]);

  const classIds = (enrollments ?? []).map((e) => e.class_id);
  const absentIds = new Set((absences ?? []).map((a) => a.lesson_id));
  const transferIds = new Set(
    ((bookings ?? []) as { lesson_id: string }[]).map((b) => b.lesson_id),
  );

  const select =
    "id, date, start_at, end_at, status, cancel_reason, class_id, classes(name), rooms(name)";
  const [{ data: lessons }, { data: transferLessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("lessons")
          .select(select)
          .eq("organization_id", orgId)
          .in("class_id", classIds)
          .gte("date", today)
          .order("date")
          .limit(20)
      : Promise.resolve({ data: [] }),
    transferIds.size > 0
      ? supabase
          .from("lessons")
          .select(select)
          .eq("organization_id", orgId)
          .in("id", [...transferIds])
          .gte("date", today)
      : Promise.resolve({ data: [] }),
  ]);

  const lessonList = (lessons ?? []) as unknown as LessonRow[];

  // 在籍期間の外のレッスンは出さない
  const enrolledVisible = lessonList.filter((l) =>
    (enrollments ?? []).some(
      (e) =>
        e.class_id === l.class_id &&
        e.start_date <= l.date &&
        (e.end_date === null || e.end_date >= l.date),
    ),
  );

  // 振替先を足す。在籍クラスの回と同じ回なら重ねない
  const seen = new Set(enrolledVisible.map((l) => l.id));
  const visible = [
    ...enrolledVisible,
    ...((transferLessons ?? []) as unknown as LessonRow[]).filter((l) => !seen.has(l.id)),
  ].sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <div className="space-y-5">
      <StudentSwitch students={students} currentId={student.id} basePath="/my" />

      <div>
        <p className="sf-kicker">Schedule</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">
          {student.name} さんの予定
        </h1>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Upcoming" title="これからのレッスン" />
        <div className="mt-4">
          {visible.length === 0 ? (
            <EmptyState
              title="予定されているレッスンはありません"
              description="クラスに登録されると、ここに開催日が並びます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {visible.map((l) => {
                const canceled = l.status === "canceled";
                const absent = absentIds.has(l.id);
                const transfer = transferIds.has(l.id);
                return (
                  <li
                    key={l.id}
                    className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${
                      canceled ? "bg-sf-danger/5" : ""
                    }`}
                  >
                    <span className="sf-num w-20 shrink-0 text-[13px] text-sf-body">
                      {formatDateJa(l.date).replace(/^\d+年/, "")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-sf-ink">
                        {l.classes?.name ?? ""}
                      </span>
                      <span className="sf-num mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-sf-muted">
                        <span>
                          {formatTimeJa(l.start_at)}–{formatTimeJa(l.end_at)}
                        </span>
                        {l.rooms?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {l.rooms.name}
                          </span>
                        )}
                      </span>
                    </span>
                    {transfer && !canceled && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-accent/12 px-2 py-1 text-[11px] font-medium text-sf-accent">
                        <Repeat className="size-3" aria-hidden />
                        振替
                      </span>
                    )}
                    {canceled ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
                        <CalendarX2 className="size-3" aria-hidden />
                        休講
                      </span>
                    ) : absent ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-ink/6 px-2 py-1 text-[11px] font-medium text-sf-body">
                        <MessageSquareOff className="size-3" aria-hidden />
                        欠席連絡済み
                      </span>
                    ) : (
                      <Link
                        href={`/my/transfers?student=${student.id}&lesson=${l.id}`}
                        className="shrink-0 rounded-lg border border-sf-border-strong/90 bg-white px-2.5 py-1.5 text-[12px] font-medium text-sf-body transition hover:border-sf-accent hover:text-sf-ink"
                      >
                        欠席を連絡
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-sf-muted">
          休講の回もここに表示されます。個別のご連絡は行いませんので、
          この画面でご確認ください。スタジオで予約した振替先の回は「振替」の印付きで並びます。
        </p>
      </Card>
    </div>
  );
}
