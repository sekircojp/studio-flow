import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { pickStudent, requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { StudentSwitch } from "@/components/student-switch";
import { AbsenceRequestForm } from "./form";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "欠席・振替" };

type LessonRow = {
  id: string;
  date: string;
  start_at: string;
  class_id: string;
  classes: { name: string } | null;
};

/**
 * 保護者からの欠席連絡と、振替権の確認（設計書 9章 項目10）
 *
 * 振替の予約はスタジオ側が行う。保護者が自分で枠を押さえられるようにすると、
 * 定員の判定と当日の運用が複雑になるため、フェーズ1では連絡までとする。
 */
export default async function MyTransfersPage({
  searchParams,
}: PageProps<"/my/transfers">) {
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
  const orgId = membership.organizationId;
  const today = todayInTokyo();

  const [{ data: enrollments }, { data: credits }, { data: absences }, { data: settings }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("class_id, start_date, end_date")
        .eq("student_id", student.id)
        .eq("organization_id", orgId),
      supabase
        .from("transfer_credits")
        .select("id, status, expires_at")
        .eq("student_id", student.id)
        .eq("organization_id", orgId)
        .order("granted_at", { ascending: false }),
      supabase
        .from("absence_requests")
        .select("lesson_id, reason, submitted_at")
        .eq("student_id", student.id)
        .eq("organization_id", orgId),
      supabase
        .from("transfer_settings")
        .select("absence_deadline_hours")
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);

  const classIds = (enrollments ?? []).map((e) => e.class_id);
  const { data: lessons } =
    classIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, date, start_at, class_id, classes(name)")
          .eq("organization_id", orgId)
          .in("class_id", classIds)
          .gte("date", today)
          .neq("status", "canceled")
          .order("date")
          .limit(20)
      : { data: [] };

  const absentIds = new Set((absences ?? []).map((a) => a.lesson_id));
  const lessonOptions = ((lessons ?? []) as unknown as LessonRow[])
    .filter((l) => !absentIds.has(l.id))
    .map((l) => ({
      id: l.id,
      label: `${formatDateJa(l.date)} ${formatTimeJa(l.start_at)} ${l.classes?.name ?? ""}`,
    }));

  const creditList = (credits ?? []) as {
    id: string;
    status: string;
    expires_at: string;
  }[];
  const available = creditList.filter((c) => c.status === "available");
  const deadline = settings?.absence_deadline_hours ?? 2;

  return (
    <div className="space-y-5">
      <StudentSwitch
        students={students}
        currentId={student.id}
        basePath="/my/transfers"
      />

      <div>
        <p className="sf-kicker">Absence</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">欠席の連絡</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sf-body">
          レッスン開始の{deadline}時間前までにご連絡いただくと、振替の権利が
          発行されます。振替先の予約はスタジオで承ります。
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Report" title="欠席を連絡する" />
        <div className="mt-4">
          <AbsenceRequestForm studentId={student.id} lessons={lessonOptions} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionHeading
          kicker="Credits"
          title={`振替の権利（${available.length}）`}
        />
        <div className="mt-4">
          {creditList.length === 0 ? (
            <EmptyState
              title="振替の権利はありません"
              description="期限内に欠席のご連絡をいただくと、ここに表示されます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {creditList.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Ticket className="size-4 shrink-0 text-sf-muted" aria-hidden />
                  <span className="sf-num min-w-0 flex-1 text-[13px] text-sf-ink">
                    {formatDateJa(c.expires_at)} まで有効
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                      c.status === "available"
                        ? "bg-sf-ok/12 text-sf-ok"
                        : "bg-sf-ink/8 text-sf-muted"
                    }`}
                  >
                    {c.status === "available"
                      ? "未使用"
                      : c.status === "used"
                        ? "使用済み"
                        : c.status === "expired"
                          ? "期限切れ"
                          : "取消"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
