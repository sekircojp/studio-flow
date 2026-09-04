import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { Card, EmptyState, SectionHeading, secondaryButtonClass } from "@/components/ui";
import { LessonFlagBadges } from "@/components/lesson-flags";
import { fetchLessonFlags } from "@/lib/lessons";

export const metadata: Metadata = { title: "出欠管理" };

type LessonRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  class_id: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
  instructors: { name: string } | null;
};

/** YYYY-MM-DD に日数を足す。date 型の列を扱うので時刻は持ち込まない */
function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 出欠管理（設計書 9章 項目6）
 *
 * その日のレッスンを選んで名簿に入る。日付の既定値は JST の今日。
 * サーバーの UTC で今日を取ると、日本の朝と夜で1日ずれる（設計書 2.1）。
 */
export default async function AttendancePage({
  searchParams,
}: PageProps<"/admin/attendance">) {
  const { membership } = await requireAdmin();
  const params = await searchParams;
  const raw = typeof params.date === "string" ? params.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayInTokyo();

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: lessons }, { data: attendances }] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, start_at, end_at, status, class_id, classes(name), rooms(name), instructors(name)",
      )
      .eq("organization_id", orgId)
      .eq("date", date)
      .order("start_at"),
    supabase
      .from("attendances")
      .select("lesson_id, status")
      .eq("organization_id", orgId),
  ]);

  const lessonList = (lessons ?? []) as unknown as LessonRow[];
  const attendanceList = (attendances ?? []) as {
    lesson_id: string;
    status: string;
  }[];

  // 名簿を開く前に、欠席連絡と振替が入っているかが分かるようにする
  const flags = await fetchLessonFlags(
    supabase,
    orgId,
    lessonList.map((l) => l.id),
  );

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Operations</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          出欠管理
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          日付を選んで、その日のレッスンの名簿を開きます。
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading kicker="Date" title={formatDateJa(date)} />
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/attendance?date=${shiftDate(date, -1)}`}
              className={secondaryButtonClass}
            >
              前の日
            </Link>
            <Link
              href={`/admin/attendance?date=${todayInTokyo()}`}
              className={secondaryButtonClass}
            >
              今日
            </Link>
            <Link
              href={`/admin/attendance?date=${shiftDate(date, 1)}`}
              className={secondaryButtonClass}
            >
              次の日
            </Link>
          </div>
        </div>

        <div className="mt-4">
          {lessonList.length === 0 ? (
            <EmptyState
              title="この日のレッスンはありません"
              description="定期クラスを登録して「レッスンを作る」を押すと、開催日が自動で並びます。休講日として登録した日には作られません。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {lessonList.map((l) => {
                const recorded = attendanceList.filter(
                  (a) => a.lesson_id === l.id && a.status !== "unconfirmed",
                ).length;

                return (
                  <li key={l.id}>
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-sf-bg"
                    >
                      <span className="sf-num w-12 shrink-0 text-[14px] font-semibold text-sf-ink">
                        {formatTimeJa(l.start_at)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-sf-ink">
                          {l.classes?.name ?? "（クラス不明）"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-sf-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" aria-hidden />
                            {formatTimeJa(l.start_at)}–{formatTimeJa(l.end_at)}
                          </span>
                          {l.rooms?.name && <span>{l.rooms.name}</span>}
                          {l.instructors?.name && <span>{l.instructors.name}</span>}
                        </span>
                      </span>

                      <LessonFlagBadges flags={flags.get(l.id)} />

                      {l.status === "canceled" ? (
                        <span className="rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
                          休講
                        </span>
                      ) : recorded > 0 ? (
                        <span className="rounded-md bg-sf-ok/12 px-2 py-1 text-[11px] font-medium text-sf-ok">
                          記録済 {recorded}
                        </span>
                      ) : (
                        <span className="rounded-md bg-sf-warn/14 px-2 py-1 text-[11px] font-medium text-sf-warn">
                          未記録
                        </span>
                      )}
                      <ChevronRight
                        className="size-4 shrink-0 text-sf-muted"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
