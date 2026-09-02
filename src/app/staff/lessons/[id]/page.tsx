import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa } from "@/lib/date";
import { recordAttendanceAsStaff, setLessonHeldAsStaff } from "../../actions";
import { Roster, type AttendanceStatus } from "@/components/roster";
import { Card, EmptyState, SectionHeading, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = { title: "出欠" };

/**
 * 講師による出欠の記録（設計書 7章 / 9章 項目6）
 *
 * 自分が担当している回だけ開ける。他人の回の id を直接入れても
 * 404 になる（画面側とサーバーアクション側の両方で確認する）。
 */
export default async function StaffLessonPage({
  params,
}: PageProps<"/staff/lessons/[id]">) {
  const { id } = await params;
  const { membership, instructor } = await requireStaff();

  if (!instructor) {
    return (
      <EmptyState
        title="講師として登録されていません"
        description="スタジオにお問い合わせください。"
      />
    );
  }

  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id, date, start_at, end_at, status, cancel_reason, class_id, classes(name), rooms(name)",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("instructor_id", instructor.id)
    .maybeSingle();

  if (!lesson) notFound();

  const klass = lesson.classes as unknown as { name: string } | null;
  const room = lesson.rooms as unknown as { name: string } | null;

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
    <div className="space-y-5">
      <div>
        <Link
          href="/staff"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          担当レッスン
        </Link>
        <h1 className="mt-2 text-xl font-bold text-sf-ink">
          {klass?.name ?? "（クラス不明）"}
        </h1>
        <p className="sf-num mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-sf-body">
          <span>
            {formatDateJa(lesson.date)} {formatTimeJa(lesson.start_at)}–
            {formatTimeJa(lesson.end_at)}
          </span>
          {room?.name && <span>{room.name}</span>}
          <span className="flex items-center gap-1 text-sf-muted">
            <Users className="size-3.5" aria-hidden />
            {students.length}名
          </span>
        </p>
      </div>

      {canceled && (
        <p className="rounded-xl bg-sf-danger/10 px-4 py-3 text-[13px] text-sf-ink">
          この回は休講です。
          {lesson.cancel_reason && `（${lesson.cancel_reason}）`}
        </p>
      )}

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Roster" title={`名簿（${students.length}）`} />
        <div className="mt-4">
          {students.length === 0 ? (
            <EmptyState
              title="在籍している生徒がいません"
              description="このクラスにまだ誰も登録されていません。スタジオにご確認ください。"
            />
          ) : (
            <Roster
              lessonId={id}
              students={students}
              initial={initial}
              disabled={canceled}
              record={recordAttendanceAsStaff}
            />
          )}
        </div>
      </Card>

      {!canceled && (
        <Card className="p-4 sm:p-5">
          <SectionHeading kicker="Lesson" title="この回の状態" />
          <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
            休講の判断はスタジオが行います。急な休講は事務所にご連絡ください。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["scheduled", "予定に戻す"],
                ["held", "実施済みにする"],
              ] as const
            ).map(([value, label]) => (
              <form
                key={value}
                action={async () => {
                  "use server";
                  await setLessonHeldAsStaff(id, value);
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
      )}
    </div>
  );
}
