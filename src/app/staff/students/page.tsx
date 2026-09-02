import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, statusLabel, statusTone } from "@/lib/students";
import { dayLabel, hhmm } from "@/lib/schedule";
import { todayInTokyo } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "生徒" };

const TONE_CLASS: Record<string, string> = {
  ok: "bg-sf-ok/12 text-sf-ok",
  info: "bg-sf-accent/12 text-sf-accent",
  warn: "bg-sf-warn/14 text-sf-warn",
  muted: "bg-sf-ink/8 text-sf-muted",
};

/**
 * 担当クラスの生徒一覧（設計書 7章）
 *
 * ★ 保護者の連絡先は出さない。
 *   設計書 7章の講師の範囲は「担当レッスン、出欠、生徒一覧」で、
 *   保護者の連絡先は含まれていない。RLS 側でも guardians の select に
 *   instructor を含めていないので、ここで問い合わせても0件になる。
 *
 * ★ 金額も出さない。「売上・報酬・未納は非表示」（設計書 7章）。
 */
export default async function StaffStudentsPage() {
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
  const today = todayInTokyo();

  // 自分が担当しているクラス
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, day_of_week, start_time, end_time")
    .eq("organization_id", orgId)
    .eq("instructor_id", instructor.id)
    .order("day_of_week")
    .order("start_time");

  const classList = (classes ?? []) as {
    id: string;
    name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[];

  const { data: enrollments } =
    classList.length > 0
      ? await supabase
          .from("enrollments")
          .select(
            "class_id, start_date, end_date, students(id, name, name_kana, birth_date, grade, status)",
          )
          .eq("organization_id", orgId)
          .in(
            "class_id",
            classList.map((c) => c.id),
          )
          .lte("start_date", today)
      : { data: [] };

  type EnrollmentRow = {
    class_id: string;
    start_date: string;
    end_date: string | null;
    students: {
      id: string;
      name: string;
      name_kana: string | null;
      birth_date: string | null;
      grade: string | null;
      status: string;
    } | null;
  };

  const active = ((enrollments ?? []) as unknown as EnrollmentRow[]).filter(
    (e) => e.end_date === null || e.end_date >= today,
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="sf-kicker">Students</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">担当クラスの生徒</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sf-body">
          出欠の確認用です。連絡先や月謝は表示されません。
        </p>
      </div>

      {classList.length === 0 ? (
        <EmptyState
          title="担当クラスがありません"
          description="クラスの担当講師に設定されると、ここに生徒が並びます。"
        />
      ) : (
        classList.map((c) => {
          const students = active
            .filter((e) => e.class_id === c.id && e.students)
            .map((e) => e.students!)
            .sort((a, b) =>
              (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, "ja"),
            );

          return (
            <Card key={c.id} className="p-4 sm:p-5">
              <SectionHeading
                kicker={`${dayLabel(c.day_of_week)}曜 ${hhmm(c.start_time)}–${hhmm(c.end_time)}`}
                title={`${c.name}（${students.length}）`}
              />
              <div className="mt-4">
                {students.length === 0 ? (
                  <p className="text-[13px] text-sf-muted">
                    在籍している生徒がいません。
                  </p>
                ) : (
                  <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
                    {students.map((s) => {
                      const age = ageFrom(s.birth_date);
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-2">
                              <span className="text-[14px] font-medium text-sf-ink">
                                {s.name}
                              </span>
                              {s.name_kana && (
                                <span className="text-[11px] text-sf-muted">
                                  {s.name_kana}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-sf-muted">
                              {age !== null && <span>{age}歳</span>}
                              {s.grade && <span>{s.grade}</span>}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              TONE_CLASS[statusTone(s.status)]
                            }`}
                          >
                            {statusLabel(s.status)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
