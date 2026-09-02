import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, ChevronRight, Clock, MapPin } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "担当レッスン" };

type LessonRow = {
  id: string;
  date: string;
  start_at: string;
  end_at: string;
  status: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
};

function LessonList({
  items,
  recordedOn,
}: {
  items: LessonRow[];
  recordedOn: (lessonId: string) => number;
}) {
  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {items.map((l) => {
        const recorded = recordedOn(l.id);
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

              {canceled ? (
                <span className="flex shrink-0 items-center gap-1 rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
                  <CalendarX2 className="size-3" aria-hidden />
                  休講
                </span>
              ) : recorded > 0 ? (
                <span className="shrink-0 rounded-md bg-sf-ok/12 px-2 py-1 text-[11px] font-medium text-sf-ok">
                  記録済 {recorded}
                </span>
              ) : (
                <span className="shrink-0 rounded-md bg-sf-warn/14 px-2 py-1 text-[11px] font-medium text-sf-warn">
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
  const [{ data: lessons }, { data: attendances }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, date, start_at, end_at, status, classes(name), rooms(name)")
      .eq("organization_id", membership.organizationId)
      .eq("instructor_id", instructor.id)
      .gte("date", today)
      .order("date")
      .order("start_at")
      .limit(30),
    supabase
      .from("attendances")
      .select("lesson_id, status")
      .eq("organization_id", membership.organizationId),
  ]);

  const all = (lessons ?? []) as unknown as LessonRow[];
  const attendanceList = (attendances ?? []) as {
    lesson_id: string;
    status: string;
  }[];

  const recordedOn = (lessonId: string) =>
    attendanceList.filter(
      (a) => a.lesson_id === lessonId && a.status !== "unconfirmed",
    ).length;

  const todays = all.filter((l) => l.date === today);
  const upcoming = all.filter((l) => l.date > today);

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
            <LessonList items={todays} recordedOn={recordedOn} />
          )}
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card className="p-4 sm:p-5">
          <SectionHeading kicker="Upcoming" title="この先の担当" />
          <div className="mt-4">
            <LessonList items={upcoming} recordedOn={recordedOn} />
          </div>
        </Card>
      )}
    </div>
  );
}
