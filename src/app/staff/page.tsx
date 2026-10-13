import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, ChevronRight, Clock, MapPin } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { LessonFlagBadges } from "@/components/lesson-flags";
import { fetchLessonFlags, type LessonFlags } from "@/lib/lessons";
import { fetchAttendanceProgress, type AttendanceProgress } from "@/lib/attendance";
import { AttendanceProgressBadge } from "@/components/attendance-progress";

export const metadata: Metadata = { title: "担当レッスン" };

type LessonRow = {
  id: string;
  class_id: string;
  date: string;
  start_at: string;
  end_at: string;
  status: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
};

function LessonList({
  items,
  progress,
  flags,
  now,
}: {
  items: LessonRow[];
  progress: Map<string, AttendanceProgress>;
  flags: Map<string, LessonFlags>;
  now: string;
}) {
  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {items.map((l) => {
        const canceled = l.status === "canceled";
        return (
          <li key={l.id}>
            <Link
              href={`/staff/lessons/${l.id}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-sf-bg"
            >
              <span className="sf-num w-14 shrink-0">
                <span className="block text-[11px] text-sf-muted">
                  {formatDateJa(l.date).replace(/^\d+年/, "").replace(/日.*/, "日")}
                </span>
                <span className="block text-[14px] font-semibold text-sf-ink">
                  {formatTimeJa(l.start_at)}
                </span>
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
                  {l.rooms?.name && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {l.rooms.name}
                    </span>
                  )}
                </span>
              </span>

              <LessonFlagBadges flags={flags.get(l.id)} />

              {canceled ? (
                <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
                  <CalendarX2 className="size-3" aria-hidden />
                  休講
                </span>
              ) : (
                <AttendanceProgressBadge
                  progress={progress.get(l.id) ?? { total: 0, recorded: 0 }}
                  ended={l.end_at < now}
                />
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
  );
}

/**
 * 講師の担当レッスン一覧（設計書 7章）
 *
 * 今日の分を上に、これからの分を下に出す。現場では「今からやる回」を
 * 開くのが大半なので、日付を選ばせない。
 */
export default async function StaffHome() {
  const { membership, instructor } = await requireStaff();

  if (!instructor) {
    return (
      <EmptyState
        title="講師として登録されていません"
        description="ログインはできていますが、講師の情報と結び付いていません。スタジオにお問い合わせください。"
      />
    );
  }

  const supabase = await createClient();
  const today = todayInTokyo();

  // RLS に加えて、アプリ層でも organization_id と担当で絞る（設計書 3章）
  const { data: lessons } = await supabase
      .from("lessons")
      // 担当は lesson_instructors で持つ（複数担当）。!inner で担当している回だけに絞る
      .select(
        "id, class_id, date, start_at, end_at, status, classes(name), rooms(name), lesson_instructors!inner(instructor_id)",
      )
      .eq("organization_id", membership.organizationId)
      .eq("lesson_instructors.instructor_id", instructor.id)
      .gte("date", today)
      .order("date")
      .order("start_at")
      .limit(30);

  const all = (lessons ?? []) as unknown as LessonRow[];
  const now = new Date().toISOString();

  // 入力の進み具合（記録済 / 対象）。数え方は lib/attendance に1つ
  const progress = await fetchAttendanceProgress(
    supabase,
    membership.organizationId,
    all,
  );

  const todays = all.filter((l) => l.date === today);
  const upcoming = all.filter((l) => l.date > today);

  // 欠席連絡と振替。現場で「今日は誰が来ないか」を先に知りたい（設計書 7章）。
  // 講師に見せないのは売上・報酬・未納であって、出欠まわりは担当分を見せる
  const flags = await fetchLessonFlags(
    supabase,
    membership.organizationId,
    all.map((l) => l.id),
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="sf-kicker">Today</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">
          {formatDateJa(today)}
        </h1>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Today" title={`本日の担当（${todays.length}）`} />
        <div className="mt-4">
          {todays.length === 0 ? (
            <EmptyState
              title="本日の担当はありません"
              description="今日は担当のレッスンが入っていない日です。"
            />
          ) : (
            <LessonList items={todays} progress={progress}
              now={now} flags={flags} />
          )}
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card className="p-4 sm:p-5">
          <SectionHeading kicker="Upcoming" title="この先の担当" />
          <div className="mt-4">
            <LessonList items={upcoming} progress={progress}
              now={now} flags={flags} />
          </div>
        </Card>
      )}
    </div>
  );
}
