import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatTimeJa, todayInTokyo } from "@/lib/date";
import { DAY_LABELS } from "@/lib/schedule";
import {
  monthEndOf,
  monthLabel,
  monthStartOf,
  monthWeeks,
  shiftMonthDate,
} from "@/lib/calendar";
import { Card, EmptyState, SectionHeading, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = { title: "カレンダー" };

type LessonRow = {
  id: string;
  date: string;
  start_at: string;
  status: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
};

/**
 * レッスンのカレンダー表示（設計書 9章 項目5）
 *
 * 休講もそのまま表示する。個別連絡を不要にするため（設計書 5.1）。
 * 休講日マスタで登録した日は、そもそもレッスンが作られないので
 * 別途「休講日」として日付に印を出す。
 */
export default async function CalendarPage({
  searchParams,
}: PageProps<"/admin/calendar">) {
  const { membership } = await requireAdmin();
  const params = await searchParams;
  const raw = typeof params.month === "string" ? params.month : "";
  const month = /^\d{4}-\d{2}(-\d{2})?$/.test(raw)
    ? monthStartOf(raw.length === 7 ? `${raw}-01` : raw)
    : monthStartOf(todayInTokyo());

  const supabase = await createClient();
  const orgId = membership.organizationId;
  const from = month;
  const to = monthEndOf(month);
  const today = todayInTokyo();

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: lessons }, { data: closures }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, date, start_at, status, classes(name), rooms(name)")
      .eq("organization_id", orgId)
      .gte("date", from)
      .lte("date", to)
      .order("start_at"),
    supabase
      .from("studio_closures")
      .select("date, name")
      .eq("organization_id", orgId)
      .gte("date", from)
      .lte("date", to),
  ]);

  const lessonList = (lessons ?? []) as unknown as LessonRow[];
  const closureList = (closures ?? []) as { date: string; name: string }[];

  const lessonsOn = (date: string) => lessonList.filter((l) => l.date === date);
  const closureOn = (date: string) => closureList.find((c) => c.date === date);

  const weeks = monthWeeks(month);
  const held = lessonList.filter((l) => l.status !== "canceled").length;
  const canceled = lessonList.filter((l) => l.status === "canceled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <p className="sf-kicker">Lessons</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
            カレンダー
          </h1>
          <p className="mt-1 text-[13px] text-sf-body">
            レッスンの日付をクリックすると、その回の出欠に進めます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/calendar?month=${shiftMonthDate(month, -1)}`}
            className={secondaryButtonClass}
          >
            前の月
          </Link>
          <Link
            href={`/admin/calendar?month=${monthStartOf(today)}`}
            className={secondaryButtonClass}
          >
            今月
          </Link>
          <Link
            href={`/admin/calendar?month=${shiftMonthDate(month, 1)}`}
            className={secondaryButtonClass}
          >
            次の月
          </Link>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading kicker="Calendar" title={monthLabel(month)} />
          <p className="flex flex-wrap items-center gap-3 text-[12px] text-sf-muted">
            <span>開催 {held} 回</span>
            {canceled > 0 && (
              <span className="text-sf-danger">休講 {canceled} 回</span>
            )}
          </p>
        </div>

        <div className="mt-4">
          {lessonList.length === 0 && closureList.length === 0 ? (
            <EmptyState
              title="この月には何もありません"
              description="クラスを登録して「レッスンを作る」を押すと、開催日がここに並びます。"
            />
          ) : (
            /* 小さい画面では横にはみ出すので、この枠の中だけスクロールさせる */
            <div className="overflow-x-auto">
              <div className="min-w-[42rem]">
                <div className="grid grid-cols-7 border-b border-sf-border pb-2">
                  {DAY_LABELS.map((d, i) => (
                    <div
                      key={d}
                      className={`text-center text-[11px] font-semibold ${
                        i === 0
                          ? "text-sf-danger"
                          : i === 6
                            ? "text-sf-accent"
                            : "text-sf-muted"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {weeks.flat().map((cell) => {
                    const dayLessons = lessonsOn(cell.date);
                    const closure = closureOn(cell.date);
                    const isToday = cell.date === today;

                    return (
                      <div
                        key={cell.date}
                        className={`min-h-24 border-b border-r border-sf-border p-1.5 ${
                          cell.inMonth ? "" : "bg-sf-bg/60"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className={`sf-num flex size-5 items-center justify-center rounded-full text-[11px] ${
                              isToday
                                ? "bg-sf-accent font-bold text-sf-accent-ink"
                                : cell.inMonth
                                  ? cell.dayOfWeek === 0
                                    ? "text-sf-danger"
                                    : "text-sf-body"
                                  : "text-sf-muted/50"
                            }`}
                          >
                            {cell.day}
                          </span>
                          {closure && (
                            <span
                              className="truncate text-[10px] text-sf-warn"
                              title={closure.name}
                            >
                              {closure.name}
                            </span>
                          )}
                        </div>

                        <ul className="mt-1 space-y-0.5">
                          {dayLessons.map((l) => {
                            const off = l.status === "canceled";
                            return (
                              <li key={l.id}>
                                <Link
                                  href={`/admin/attendance/${l.id}`}
                                  title={`${l.classes?.name ?? ""} ${l.rooms?.name ?? ""}`}
                                  className={`block truncate rounded px-1 py-0.5 text-[10px] transition ${
                                    off
                                      ? "bg-sf-danger/10 text-sf-danger line-through"
                                      : "bg-sf-accent/10 text-sf-ink hover:bg-sf-accent/20"
                                  }`}
                                >
                                  {off && (
                                    <CalendarX2
                                      className="mr-0.5 inline size-2.5"
                                      aria-hidden
                                    />
                                  )}
                                  <span className="sf-num">
                                    {formatTimeJa(l.start_at)}
                                  </span>{" "}
                                  {l.classes?.name ?? ""}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-sf-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-sf-accent/20" />
            開催予定
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-sf-danger/20" />
            休講（保護者の画面にも表示されます）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-sf-warn/30" />
            休講日マスタ（レッスンが作られない日）
          </span>
        </p>
      </Card>
    </div>
  );
}
