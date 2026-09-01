import type { Metadata } from "next";
import { CalendarX2, MapPin } from "lucide-react";
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

  // 在籍しているクラスの、今日以降のレッスン
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("class_id, start_date, end_date")
    .eq("student_id", student.id)
    .eq("organization_id", membership.organizationId);

  const classIds = (enrollments ?? []).map((e) => e.class_id);

  const { data: lessons } =
    classIds.length > 0
      ? await supabase
          .from("lessons")
          .select(
            "id, date, start_at, end_at, status, cancel_reason, class_id, classes(name), rooms(name)",
          )
          .eq("organization_id", membership.organizationId)
          .in("class_id", classIds)
          .gte("date", today)
          .order("date")
          .limit(20)
      : { data: [] };

  const lessonList = (lessons ?? []) as unknown as LessonRow[];

  // 在籍期間の外のレッスンは出さない
  const visible = lessonList.filter((l) =>
    (enrollments ?? []).some(
      (e) =>
        e.class_id === l.class_id &&
        e.start_date <= l.date &&
        (e.end_date === null || e.end_date >= l.date),
    ),
  );

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
                    {canceled && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
                        <CalendarX2 className="size-3" aria-hidden />
                        休講
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-sf-muted">
          休講の回もここに表示されます。個別のご連絡は行いませんので、
          この画面でご確認ください。
        </p>
      </Card>
    </div>
  );
}
