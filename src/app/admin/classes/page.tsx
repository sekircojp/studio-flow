import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clock, DoorOpen, User } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateJa, formatYen } from "@/lib/date";
import { ClassForm, GenerateLessonsButton } from "./forms";
import { dayLabel, hhmm } from "@/lib/schedule";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "定期クラス" };

type ClassRow = {
  id: string;
  name: string;
  genre: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  enrollment_capacity: number | null;
  room_capacity: number | null;
  monthly_fee: number;
  room_id: string;
  instructor_id: string | null;
  season_id: string;
};

/**
 * 定期クラス（設計書 4.2）とレッスン一括生成（設計書 5.1）
 *
 * 生成は「期の期間のうち、クラスの曜日に当たる日から休講日を除いたもの」。
 * 出欠が記録された回と、実施済み・休講にした回は作り直しの対象から外れる。
 */
export default async function ClassesPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    { data: classes },
    { data: seasons },
    { data: rooms },
    { data: instructors },
    { data: lessons },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select(
        "id, name, genre, day_of_week, start_time, end_time, enrollment_capacity, room_capacity, monthly_fee, room_id, instructor_id, season_id",
      )
      .eq("organization_id", orgId)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("seasons")
      .select("id, name, is_current")
      .eq("organization_id", orgId)
      .order("start_date", { ascending: false }),
    supabase
      .from("rooms")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("instructors")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("lessons")
      .select("class_id, date, status")
      .eq("organization_id", orgId)
      .order("date"),
  ]);

  const classList = (classes ?? []) as ClassRow[];
  const seasonList = (seasons ?? []) as { id: string; name: string; is_current: boolean }[];
  const roomList = (rooms ?? []) as { id: string; name: string }[];
  const instructorList = (instructors ?? []) as { id: string; name: string }[];
  const lessonList = (lessons ?? []) as {
    class_id: string;
    date: string;
    status: string;
  }[];

  const nameOf = (list: { id: string; name: string }[], id: string | null) =>
    id ? (list.find((x) => x.id === id)?.name ?? "—") : null;

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Lessons</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          定期クラス
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          毎週決まった曜日・時間に開くクラスです。登録したあと「レッスンを作る」を押すと、
          期の期間のうちその曜日に当たる日が一気に作られ、休講日は除かれます。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Classes" title="登録済みのクラス" />
        <div className="mt-4">
          {classList.length === 0 ? (
            <EmptyState
              title="クラスがまだありません"
              description="下の「クラスを追加」から登録してください。期と部屋が先に必要です。"
            />
          ) : (
            <ul className="space-y-3">
              {classList.map((c) => {
                const mine = lessonList.filter((l) => l.class_id === c.id);
                const scheduled = mine.filter((l) => l.status === "scheduled");
                const seasonName =
                  seasonList.find((s) => s.id === c.season_id)?.name ?? "—";

                return (
                  <li
                    key={c.id}
                    className="rounded-xl border border-sf-border p-4"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sf-ink">
                          {c.name}
                          {c.genre && (
                            <span className="ml-2 rounded-md bg-sf-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-sf-accent">
                              {c.genre}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5" aria-hidden />
                            毎週{dayLabel(c.day_of_week)}曜 {hhmm(c.start_time)}–
                            {hhmm(c.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <DoorOpen className="size-3.5" aria-hidden />
                            {nameOf(roomList, c.room_id)}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="size-3.5" aria-hidden />
                            {nameOf(instructorList, c.instructor_id) ?? "担当未定"}
                          </span>
                          <span>{seasonName}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="sf-num text-[15px] font-bold text-sf-ink">
                          {formatYen(c.monthly_fee)}
                        </p>
                        <p className="text-[11px] text-sf-muted">
                          在籍 {c.enrollment_capacity ?? "—"} / 1回上限{" "}
                          {c.room_capacity ?? "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-sf-border pt-3">
                      <p className="flex items-center gap-1.5 text-[12px] text-sf-body">
                        <CalendarCheck
                          className="size-3.5 text-sf-muted"
                          aria-hidden
                        />
                        {mine.length === 0 ? (
                          <span className="text-sf-warn">レッスン未作成</span>
                        ) : (
                          <>
                            <span className="sf-num font-medium">
                              {mine.length} 回
                            </span>
                            <span className="text-sf-muted">
                              （予定 {scheduled.length}／
                              {formatShortDateJa(mine[0].date)} 〜{" "}
                              {formatShortDateJa(mine[mine.length - 1].date)}）
                            </span>
                          </>
                        )}
                      </p>
                      <GenerateLessonsButton
                        classId={c.id}
                        hasLessons={mine.length > 0}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <ClassForm
              seasons={seasonList}
              rooms={roomList}
              instructors={instructorList}
            />
          </div>
        </div>
      </Card>

      <p className="text-[12px] leading-relaxed text-sf-muted">
        <strong className="font-medium text-sf-body">作り直しについて</strong>
        ：曜日や時間を変えたあとに「作り直す」を押すと、まだ予定のままの回だけが
        作り直されます。<strong className="font-medium text-sf-body">出欠を記録した回、
        実施済みにした回、休講にした回は消えません。</strong>
        講師は{" "}
        <Link href="/admin/instructors" className="underline">
          講師の画面
        </Link>
        、休講日は{" "}
        <Link href="/admin/seasons" className="underline">
          期・休講日の画面
        </Link>
        で登録します。
      </p>
    </div>
  );
}
