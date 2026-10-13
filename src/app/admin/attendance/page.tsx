import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatShortDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import {
  Card,
  DataTable,
  EmptyState,
  Pill,
  SectionHeading,
  secondaryButtonClass,
  Td,
  Th,
} from "@/components/ui";
import { LessonFlagBadges } from "@/components/lesson-flags";
import { fetchLessonFlags } from "@/lib/lessons";
import {
  fetchAttendanceProgress,
  fetchIncompleteLessons,
  progressLabel,
} from "@/lib/attendance";
import { AttendanceProgressBadge } from "@/components/attendance-progress";
import { instructorLabel, type InstructorJoin } from "@/lib/instructors";

export const metadata: Metadata = { title: "出欠管理" };

type LessonRow = {
  id: string;
  class_id: string;
  date: string;
  start_at: string;
  end_at: string;
  status: string;
  classes: { name: string } | null;
  rooms: { name: string } | null;
  lesson_instructors: InstructorJoin[] | null;
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
 * 2つの見方がある。
 *   日付     … その日のレッスンを選んで名簿に入る。既定は JST の今日
 *   未完了   … 終わったのに入力が終わっていない回だけを、新しい順に並べる。
 *              ダッシュボードの「出欠が未完了」から来る
 *
 * 入力の進み具合（記録済 / 対象）の数え方は lib/attendance に1つ。
 * サーバーの UTC で今日を取ると、日本の朝と夜で1日ずれる（設計書 2.1）。
 */
export default async function AttendancePage({
  searchParams,
}: PageProps<"/admin/attendance">) {
  const { membership } = await requireAdmin();
  const params = await searchParams;
  const raw = typeof params.date === "string" ? params.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayInTokyo();
  const view = params.view === "incomplete" ? "incomplete" : "date";

  const supabase = await createClient();
  const orgId = membership.organizationId;

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

      {view === "incomplete" ? (
        <IncompleteView supabase={supabase} orgId={orgId} />
      ) : (
        <DateView supabase={supabase} orgId={orgId} date={date} />
      )}
    </div>
  );
}

type Db = Awaited<ReturnType<typeof createClient>>;

/** その日のレッスン */
async function DateView({
  supabase,
  orgId,
  date,
}: {
  supabase: Db;
  orgId: string;
  date: string;
}) {
  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const { data: lessons } = await supabase
    .from("lessons")
    .select(
      "id, class_id, date, start_at, end_at, status, classes(name), rooms(name), lesson_instructors(display_order, instructors(name))",
    )
    .eq("organization_id", orgId)
    .eq("date", date)
    .order("start_at");

  const lessonList = (lessons ?? []) as unknown as LessonRow[];
  const now = new Date().toISOString();

  // 名簿を開く前に、欠席連絡と振替、入力の進み具合が分かるようにする
  const [flags, progress] = await Promise.all([
    fetchLessonFlags(supabase, orgId, lessonList.map((l) => l.id)),
    fetchAttendanceProgress(supabase, orgId, lessonList),
  ]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading kicker="Date" title={formatDateJa(date)} />
        <div className="flex flex-wrap items-center gap-2">
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
          <Link
            href="/admin/attendance?view=incomplete"
            className={`${secondaryButtonClass} text-sf-warn hover:border-sf-warn`}
          >
            未完了の回
          </Link>
        </div>
      </div>

      <div className="mt-4">
        {lessonList.length === 0 ? (
          <EmptyState
            title="この日のレッスンはありません"
            description="クラスを登録して「レッスンを作る」を押すと、開催日が自動で並びます。休講日として登録した日には作られません。"
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>時刻</Th>
                <Th>クラス</Th>
                <Th>ルーム</Th>
                <Th>担当</Th>
                <Th>連絡・振替</Th>
                <Th>出欠</Th>
                <Th>
                  <span className="sr-only">開く</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lessonList.map((l) => (
                <tr key={l.id}>
                  <Td className="sf-num whitespace-nowrap">
                    <Link href={`/admin/attendance/${l.id}`} className="block hover:underline">
                      <span className="block text-[14px] font-semibold text-sf-ink">
                        {formatTimeJa(l.start_at)}
                      </span>
                      <span className="block text-[12px] text-sf-muted">
                        –{formatTimeJa(l.end_at)}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      className="block text-[14px] font-semibold text-sf-ink hover:underline"
                    >
                      {l.classes?.name ?? "（クラス不明）"}
                    </Link>
                  </Td>
                  <Td className="text-sf-body">{l.rooms?.name ?? "—"}</Td>
                  <Td className="text-sf-body">
                    {instructorLabel(l.lesson_instructors) ?? "—"}
                  </Td>
                  <Td>
                    <LessonFlagBadges flags={flags.get(l.id)} />
                  </Td>
                  <Td>
                    {l.status === "canceled" ? (
                      <Pill tone="danger">休講</Pill>
                    ) : (
                      <AttendanceProgressBadge
                        progress={progress.get(l.id) ?? { total: 0, recorded: 0 }}
                        ended={l.end_at < now}
                      />
                    )}
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      aria-label="名簿を開く"
                      className="inline-flex size-8 items-center justify-center rounded-full text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </Card>
  );
}

/** 終わったのに入力が終わっていない回 */
async function IncompleteView({ supabase, orgId }: { supabase: Db; orgId: string }) {
  const items = await fetchIncompleteLessons(supabase, orgId);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading
          kicker="Incomplete"
          title={`出欠が未完了の回（${items.length}）`}
        />
        <Link href="/admin/attendance" className={secondaryButtonClass}>
          <X className="size-3.5" aria-hidden />
          絞り込みを解除
        </Link>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
        終了時刻を過ぎた回のうち、名簿の全員ぶんの出欠が入っていない回です。
        休講と、在籍者のいない回は含みません。
      </p>

      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState
            title="未完了の回はありません"
            description="終わった回はすべて入力が済んでいます。"
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>日付</Th>
                <Th>時刻</Th>
                <Th>クラス</Th>
                <Th>入力状況</Th>
                <Th>
                  <span className="sr-only">開く</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <Td className="sf-num whitespace-nowrap text-sf-body">
                    {formatShortDateJa(l.date)}
                  </Td>
                  <Td className="sf-num whitespace-nowrap text-[14px] font-semibold text-sf-ink">
                    {formatTimeJa(l.start_at)}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      className="block text-[14px] font-semibold text-sf-ink hover:underline"
                    >
                      {l.className}
                    </Link>
                  </Td>
                  <Td>
                    <Pill tone="warn">
                      {l.progress.recorded === 0
                        ? `未入力 ${l.progress.total} 名`
                        : progressLabel(l.progress)}
                    </Pill>
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      aria-label="名簿を開く"
                      className="inline-flex size-8 items-center justify-center rounded-full text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </Card>
  );
}
