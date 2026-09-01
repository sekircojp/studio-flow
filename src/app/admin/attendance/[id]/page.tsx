import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa } from "@/lib/date";
import { setLessonStatus, type AttendanceStatus } from "../actions";
import { Roster } from "./roster";
import { Card, EmptyState, SectionHeading, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = { title: "出欠" };

/**
 * 出欠の記録
 *
 * 名簿はその回の時点で在籍している生徒。途中入会・途中退会があるので、
 * 在籍期間とレッスンの日付で絞る。
 *
 * 記録すると DB のトリガが lessons.has_attendance_record を立て、
 * この回はレッスンの作り直しで消えなくなる（設計書 5.1）。
 */
export default async function AttendanceDetailPage({
  params,
}: PageProps<"/admin/attendance/[id]">) {
  const { id } = await params;
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id, date, start_at, end_at, status, cancel_reason, class_id, classes(name, room_capacity), rooms(name), instructors(name)",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!lesson) notFound();

  const klass = lesson.classes as unknown as {
    name: string;
    room_capacity: number | null;
  } | null;
  const room = lesson.rooms as unknown as { name: string } | null;
  const instructor = lesson.instructors as unknown as { name: string } | null;

  // その回の時点で在籍している生徒だけを名簿に出す
  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, start_date, end_date, students(name, name_kana)")
      .eq("class_id", lesson.class_id)
      .eq("organization_id", orgId)
      .lte("start_date", lesson.date),
    supabase
      .from("attendances")
      .select("student_id, status")
      .eq("lesson_id", id)
      .eq("organization_id", orgId),
  ]);

  type EnrollmentRow = {
    student_id: string;
    start_date: string;
    end_date: string | null;
    students: { name: string; name_kana: string | null } | null;
  };

  const students = ((enrollments ?? []) as unknown as EnrollmentRow[])
    .filter((e) => e.end_date === null || e.end_date >= lesson.date)
    .map((e) => ({
      id: e.student_id,
      name: e.students?.name ?? "（生徒不明）",
      kana: e.students?.name_kana ?? null,
    }))
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja"));

  const initial: Record<string, AttendanceStatus> = {};
  for (const a of (attendances ?? []) as {
    student_id: string;
    status: AttendanceStatus;
  }[]) {
    initial[a.student_id] = a.status;
  }

  const canceled = lesson.status === "canceled";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/attendance?date=${lesson.date}`}
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {formatDateJa(lesson.date)}のレッスン
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          {klass?.name ?? "（クラス不明）"}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-sf-body">
          <span className="sf-num">
            {formatDateJa(lesson.date)} {formatTimeJa(lesson.start_at)}–
            {formatTimeJa(lesson.end_at)}
          </span>
          {room?.name && <span>{room.name}</span>}
          {instructor?.name && <span>{instructor.name}</span>}
          <span className="flex items-center gap-1 text-sf-muted">
            <Users className="size-3.5" aria-hidden />
            在籍 {students.length}
            {klass?.room_capacity != null && ` / 1回上限 ${klass.room_capacity}`}
          </span>
        </p>
      </div>

      {canceled && (
        <p className="rounded-xl bg-sf-danger/10 px-4 py-3 text-[13px] text-sf-ink">
          この回は休講です。
          {lesson.cancel_reason && `（${lesson.cancel_reason}）`}
          保護者のカレンダーにも休講として表示されます。
        </p>
      )}

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Roster" title={`名簿（${students.length}）`} />
        <div className="mt-4">
          {students.length === 0 ? (
            <EmptyState
              title="このクラスに在籍している生徒がいません"
              description="生徒の画面から、このクラスへの在籍を登録してください。"
            />
          ) : (
            <Roster
              lessonId={id}
              students={students}
              initial={initial}
              disabled={canceled}
            />
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Lesson" title="この回の状態" />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          休講にすると保護者のカレンダーにも反映されるので、個別の連絡が要りません。
          出欠を記録した回は、クラスの曜日を変えて作り直しても消えません。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["scheduled", "予定に戻す"],
              ["held", "実施済みにする"],
              ["canceled", "休講にする"],
            ] as const
          ).map(([value, label]) => (
            <form
              key={value}
              action={async () => {
                "use server";
                await setLessonStatus(id, value);
              }}
            >
              <button
                type="submit"
                disabled={lesson.status === value}
                className={`${secondaryButtonClass} ${
                  lesson.status === value
                    ? "border-sf-accent bg-sf-accent/5 text-sf-ink"
                    : ""
                }`}
              >
                {lesson.status === value ? "● " : ""}
                {label}
              </button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
