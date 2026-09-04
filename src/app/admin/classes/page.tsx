import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clock, DoorOpen, User } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateJa, formatYen } from "@/lib/date";
import {
  AddMeetingForm,
  ClassForm,
  GenerateLessonsButton,
  MeetingToggleButton,
} from "./forms";
import { meetingLabel, weeklyCountLabel } from "@/lib/schedule";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "定期クラス" };

type ClassRow = {
  id: string;
  name: string;
  genre: string | null;
  enrollment_capacity: number | null;
  room_capacity: number | null;
  monthly_fee: number;
  instructor_id: string | null;
  season_id: string;
};

type MeetingRow = {
  id: string;
  class_id: string;
  room_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

/**
 * 定期クラス（設計書 4.2）とレッスン一括生成（設計書 5.1）
 *
 * クラスは週に何回開いてもよい。開催枠（class_meetings）を複数持てる。
 * 「初級クラス（週2回レッスン）」は1クラスで、開催枠が2件。
 *
 * 生成は「期の期間のうち、各開催枠の曜日に当たる日から休講日を除いたもの」。
 * 出欠が記録された回と、実施済み・休講にした回は作り直しの対象から外れる。
 */
export default async function ClassesPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    { data: classes },
    { data: meetings },
    { data: seasons },
    { data: rooms },
    { data: instructors },
    { data: lessons },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select(
        "id, name, genre, enrollment_capacity, room_capacity, monthly_fee, instructor_id, season_id",
      )
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("class_meetings")
      .select(
        "id, class_id, room_id, day_of_week, start_time, end_time, is_active",
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
  const meetingList = (meetings ?? []) as MeetingRow[];
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
          毎週決まった曜日・時間に開くクラスです。1つのクラスが週に何回あっても構いません
          （週2回の初級クラスも1クラスとして数えます）。登録したあと「レッスンを作る」を
          押すと、期の期間のうち各曜日に当たる日が一気に作られ、休講日は除かれます。
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
                const myMeetings = meetingList.filter((m) => m.class_id === c.id);
                const weekly = weeklyCountLabel(
                  myMeetings.filter((m) => m.is_active),
                );
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
                          {weekly && (
                            <span className="ml-2 rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-body">
                              {weekly}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-muted">
                          <span className="flex items-center gap-1">
                            <User className="size-3.5" aria-hidden />
                            {nameOf(instructorList, c.instructor_id) ?? "担当未定"}
                          </span>
                          <span>{seasonName}</span>
                        </p>

                        {/* 開催枠。週2回のクラスなら2行並ぶ */}
                        <ul className="mt-2 space-y-1">
                          {myMeetings.map((m) => (
                            <li
                              key={m.id}
                              className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] ${
                                m.is_active ? "text-sf-body" : "text-sf-muted"
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <Clock className="size-3.5" aria-hidden />
                                {meetingLabel(m)}
                              </span>
                              <span className="flex items-center gap-1 text-sf-muted">
                                <DoorOpen className="size-3.5" aria-hidden />
                                {nameOf(roomList, m.room_id)}
                              </span>
                              {!m.is_active && (
                                <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px]">
                                  停止中
                                </span>
                              )}
                              <MeetingToggleButton
                                meetingId={m.id}
                                isActive={m.is_active}
                                label={meetingLabel(m)}
                              />
                            </li>
                          ))}
                        </ul>
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
                      <div className="flex flex-wrap items-center gap-3">
                        <AddMeetingForm classId={c.id} rooms={roomList} />
                        <GenerateLessonsButton
                          classId={c.id}
                          hasLessons={mine.length > 0}
                        />
                      </div>
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
