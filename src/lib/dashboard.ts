import type { SupabaseClient } from "@supabase/supabase-js";
import { UNPAID_STATUSES, monthStart, shiftMonth } from "@/lib/billing";
import { fetchLessonFlags, type LessonFlags } from "@/lib/lessons";
import {
  fetchAttendanceProgress,
  fetchIncompleteLessons,
  type AttendanceProgress,
} from "@/lib/attendance";
import { instructorLabel, type InstructorJoin } from "@/lib/instructors";

/**
 * ダッシュボードの材料
 * ────────────────────────────────────────────────
 * 画面に出す数字は、すべてここで作る。画面側に数え方を書かない。
 *
 * ★ 取得に失敗したものは「0件」にしない。
 *   `?? 0` で潰すと「対応待ちはありません」「全額入金済み」と出て、運営が
 *   安心してしまう。失敗した項目は failed に名前を積み、画面でその旨を出す。
 *   一部が失敗しても、取れた項目はそのまま出す。
 *
 * ★ "use client" のファイルに置かないこと。Server Component から読む。
 */

export type TodoItem = {
  key: string;
  href: string;
  title: string;
  /** 件数や金額。行の左に大きく出す */
  figure: string;
  detail: string;
  tone: "warn" | "accent" | "neutral";
};

export type TodayLesson = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  className: string;
  roomName: string;
  instructorName: string;
  progress: AttendanceProgress;
  flags: LessonFlags;
  trials: number;
  /** 来場予定。名簿 − 欠席連絡 ＋ 振替 ＋ 体験 */
  expected: number;
  ended: boolean;
};

export type TuitionSummary = {
  month: string;
  /** no_contracts 請求対象なし / not_generated 請求未作成 / open 未入金あり / all_paid 全額入金済み */
  state: "no_contracts" | "not_generated" | "open" | "all_paid";
  billed: number;
  collected: number;
  unpaidCount: number;
  unpaidAmount: number;
  overdueCount: number;
  overdueAmount: number;
  carriedCount: number;
  carriedAmount: number;
};

export type Dashboard = {
  todos: TodoItem[];
  lessons: TodayLesson[];
  hasAnyLesson: boolean;
  weekChanges: { canceled: number; absences: number; transfersIn: number };
  tuition: TuitionSummary;
  counts: { students: number | null; classes: number | null; locations: number | null };
  setup: { needsLocation: boolean; needsSeason: boolean; needsClass: boolean };
  /** 取得できなかった項目の名前。空なら全部取れている */
  failed: string[];
};

/** YYYY-MM-DD に日数を足す。date 型の列を扱うので時刻は持ち込まない */
function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Result<T> = { data: T | null; error: unknown; count?: number | null };

export async function fetchDashboard(
  supabase: SupabaseClient,
  organizationId: string,
  today: string,
  formatYen: (n: number) => string,
): Promise<Dashboard> {
  const failed: string[] = [];
  /** 失敗を記録しつつ data を返す。失敗したら null */
  const take = <T>(label: string, r: Result<T>): T | null => {
    if (r.error) {
      console.error(`ダッシュボード: ${label} の取得に失敗しました`, r.error);
      failed.push(label);
      return null;
    }
    return r.data;
  };
  const takeCount = (label: string, r: Result<unknown>): number | null => {
    if (r.error) {
      console.error(`ダッシュボード: ${label} の取得に失敗しました`, r.error);
      failed.push(label);
      return null;
    }
    return r.count ?? 0;
  };

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const month = monthStart(today);
  const nextMonth = shiftMonth(month, 1);
  const weekEnd = shiftDate(today, 6);
  const org = organizationId;

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    rStudents,
    rLocations,
    rSeason,
    rTrials,
    rApplications,
    rTodayLessons,
    rAnyLesson,
    rWeekLessons,
    rMonthInvoices,
    rCarried,
    rContracts,
    rSettings,
    rEvents,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "active"),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("is_active", true),
    supabase
      .from("seasons")
      .select("id")
      .eq("organization_id", org)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("trials")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "pending"),
    supabase
      .from("enrollment_applications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "pending"),
    supabase
      .from("lessons")
      .select(
        "id, class_id, date, start_at, end_at, status, classes(name), rooms(name), lesson_instructors(display_order, instructors(name))",
      )
      .eq("organization_id", org)
      .eq("date", today)
      .order("start_at"),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org),
    supabase
      .from("lessons")
      .select("id, status")
      .eq("organization_id", org)
      .gte("date", today)
      .lte("date", weekEnd),
    supabase
      .from("invoices")
      .select("id, total, status, student_id, due_date")
      .eq("organization_id", org)
      .eq("billing_month", month),
    supabase
      .from("invoices")
      .select("id, total, student_id, due_date")
      .eq("organization_id", org)
      .lt("billing_month", month)
      .in("status", UNPAID_STATUSES),
    // 今月の請求対象（月次生成と同じ条件）
    supabase
      .from("student_contracts")
      .select("student_id")
      .eq("organization_id", org)
      .in("status", ["active", "suspended_billed"])
      .lt("start_date", nextMonth)
      .or(`end_date.is.null,end_date.gte.${month}`),
    supabase
      .from("billing_settings")
      .select("issue_day")
      .eq("organization_id", org)
      .maybeSingle(),
    // 案内済みで、まだ開催していないイベント
    supabase
      .from("events")
      .select("id, title, answer_deadline_at, start_at")
      .eq("organization_id", org)
      .eq("status", "planned")
      .eq("is_public", true)
      .gte("start_at", nowIso)
      .order("answer_deadline_at", { ascending: true, nullsFirst: false }),
  ]);

  const students = takeCount("在籍生徒", rStudents);
  const locations = takeCount("スタジオ", rLocations);
  const season = take("期", rSeason);
  const trials = takeCount("体験の申込", rTrials);
  const applications = takeCount("入会申込", rApplications);
  const todayRows = take("本日のレッスン", rTodayLessons);
  const anyLesson = takeCount("レッスン", rAnyLesson);
  const weekRows = take("今週のレッスン", rWeekLessons);
  const monthInvoices = take("今月の請求", rMonthInvoices);
  const carriedRows = take("先月までの未収", rCarried);
  const contracts = take("月謝契約", rContracts);
  const settings = take("請求の設定", rSettings);
  const eventRows = take("発表会", rEvents);

  // クラス数は期が分かってから数える
  const rClasses = season
    ? await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org)
        .eq("season_id", (season as { id: string }).id)
    : await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org);
  const classes = takeCount("クラス", rClasses);

  // ---------------------------------------------------------------- 本日のレッスン
  type Joined = {
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
  const todayJoined = (todayRows ?? []) as unknown as Joined[];
  const todayIds = todayJoined.map((l) => l.id);

  const [flags, progress, rTrialCounts] = await Promise.all([
    fetchLessonFlags(supabase, org, todayIds),
    fetchAttendanceProgress(supabase, org, todayJoined),
    todayIds.length > 0
      ? supabase
          .from("trials")
          .select("lesson_id")
          .eq("organization_id", org)
          .in("lesson_id", todayIds)
          .in("status", ["booked", "attended"])
      : Promise.resolve({ data: [], error: null } as Result<{ lesson_id: string }[]>),
  ]);
  const trialRows = (take("体験の予定", rTrialCounts) ?? []) as { lesson_id: string }[];

  const lessons: TodayLesson[] = todayJoined.map((l) => {
    const p = progress.get(l.id) ?? { total: 0, recorded: 0 };
    const f = flags.get(l.id) ?? { absences: 0, transfersIn: 0 };
    const t = trialRows.filter((x) => x.lesson_id === l.id).length;
    return {
      id: l.id,
      start_at: l.start_at,
      end_at: l.end_at,
      status: l.status,
      className: l.classes?.name ?? "（クラス不明）",
      roomName: l.rooms?.name ?? "",
      instructorName: instructorLabel(l.lesson_instructors) ?? "",
      progress: p,
      flags: f,
      trials: t,
      expected: Math.max(p.total - f.absences, 0) + f.transfersIn + t,
      ended: l.end_at < nowIso,
    };
  });

  // ---------------------------------------------------------------- 今週の変更
  const weekList = (weekRows ?? []) as { id: string; status: string }[];
  const weekFlags = await fetchLessonFlags(
    supabase,
    org,
    weekList.filter((l) => l.status !== "canceled").map((l) => l.id),
  );
  const weekChanges = { canceled: 0, absences: 0, transfersIn: 0 };
  weekChanges.canceled = weekList.filter((l) => l.status === "canceled").length;
  for (const f of weekFlags.values()) {
    weekChanges.absences += f.absences;
    weekChanges.transfersIn += f.transfersIn;
  }

  // ---------------------------------------------------------------- 月謝
  type Inv = { id: string; total: number; status?: string; student_id: string; due_date: string | null };
  const monthRows = ((monthInvoices ?? []) as Inv[]).filter((i) => i.status !== "canceled");
  const carried = (carriedRows ?? []) as Inv[];
  const relevantIds = [...monthRows, ...carried].map((i) => i.id);

  const rPayments =
    relevantIds.length > 0
      ? await supabase
          .from("payments")
          .select("invoice_id, amount")
          .eq("organization_id", org)
          .in("invoice_id", relevantIds)
      : ({ data: [], error: null } as Result<{ invoice_id: string; amount: number }[]>);
  const payments = (take("入金", rPayments) ?? []) as { invoice_id: string; amount: number }[];
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount);
  const remainingOf = (i: Inv) => Math.max(i.total - (paid.get(i.id) ?? 0), 0);

  const billed = monthRows.reduce((s, i) => s + i.total, 0);
  const collected = monthRows.reduce((s, i) => s + Math.min(paid.get(i.id) ?? 0, i.total), 0);
  const unpaidRows = monthRows.filter((i) => UNPAID_STATUSES.includes(i.status as never));
  const overdueRows = unpaidRows.filter((i) => i.due_date !== null && i.due_date < today);
  const contractStudents = new Set(
    ((contracts ?? []) as { student_id: string }[]).map((c) => c.student_id),
  ).size;

  const tuition: TuitionSummary = {
    month,
    state:
      monthRows.length > 0
        ? unpaidRows.length > 0
          ? "open"
          : "all_paid"
        : contractStudents > 0
          ? "not_generated"
          : "no_contracts",
    billed,
    collected,
    unpaidCount: new Set(unpaidRows.map((i) => i.student_id)).size,
    unpaidAmount: unpaidRows.reduce((s, i) => s + remainingOf(i), 0),
    overdueCount: new Set(overdueRows.map((i) => i.student_id)).size,
    overdueAmount: overdueRows.reduce((s, i) => s + remainingOf(i), 0),
    carriedCount: new Set(carried.map((i) => i.student_id)).size,
    carriedAmount: carried.reduce((s, i) => s + remainingOf(i), 0),
  };

  // ---------------------------------------------------------------- 対応待ち
  const todos: TodoItem[] = [];

  if (trials !== null && trials > 0) {
    todos.push({
      key: "trials",
      href: "/admin/students/trials",
      title: "体験・見学の承認待ち",
      figure: `${trials} 件`,
      detail: "承認か見送りを押すと、保護者にメールで届きます",
      tone: "accent",
    });
  }
  if (applications !== null && applications > 0) {
    todos.push({
      key: "applications",
      href: "/admin/students/applications",
      title: "入会申込の承認待ち",
      figure: `${applications} 件`,
      detail: "承認すると生徒・保護者として登録されます",
      tone: "accent",
    });
  }

  // 終わったのに出欠の入力が終わっていない回
  let incomplete: Awaited<ReturnType<typeof fetchIncompleteLessons>> = [];
  try {
    incomplete = await fetchIncompleteLessons(supabase, org, nowDate);
  } catch (e) {
    console.error("ダッシュボード: 出欠の未完了 の取得に失敗しました", e);
    failed.push("出欠の未完了");
  }
  if (incomplete.length > 0) {
    const oldest = incomplete[incomplete.length - 1];
    const waitingDays = Math.floor(
      (nowDate.getTime() - new Date(oldest.end_at).getTime()) / 86_400_000,
    );
    todos.push({
      key: "attendance",
      href: "/admin/attendance?view=incomplete",
      title: "出欠の入力が終わっていない回",
      figure: `${incomplete.length} 回`,
      detail:
        waitingDays >= 1
          ? `いちばん古い回から ${waitingDays} 日。放っておくと振替権が出ません`
          : "今日終わった回です。放っておくと振替権が出ません",
      tone: "warn",
    });
  }

  // 支払期限を過ぎた未納（今月分も先月以前も）
  const overdueAll = [...overdueRows, ...carried.filter((i) => i.due_date !== null && i.due_date < today)];
  if (overdueAll.length > 0) {
    todos.push({
      key: "overdue",
      href: "/admin/billing?overdue=1",
      title: "支払期限を過ぎた未納",
      figure: formatYen(overdueAll.reduce((s, i) => s + remainingOf(i), 0)),
      detail: `${new Set(overdueAll.map((i) => i.student_id)).size} 名・${overdueAll.length} 件。入金があれば登録してください`,
      tone: "warn",
    });
  }

  // 今月の請求が未作成（請求日を過ぎているのに）
  const issueDay = (settings as { issue_day?: number } | null)?.issue_day ?? 1;
  if (tuition.state === "not_generated" && Number(today.slice(8, 10)) >= issueDay) {
    todos.push({
      key: "invoices",
      href: `/admin/billing?month=${month}`,
      title: "今月の請求が未作成",
      figure: `${contractStudents} 名`,
      detail: "月謝契約のある生徒に、今月の請求がまだ作られていません",
      tone: "warn",
    });
  }

  // 発表会の回答待ち。締切を過ぎても、開催前で未回答が残っていれば出す
  const events = (eventRows ?? []) as {
    id: string;
    title: string;
    answer_deadline_at: string | null;
    start_at: string;
  }[];
  if (events.length > 0) {
    const rEntries = await supabase
      .from("event_entries")
      .select("event_id, status")
      .eq("organization_id", org)
      .in(
        "event_id",
        events.map((e) => e.id),
      );
    const entries = (take("発表会の回答", rEntries) ?? []) as { event_id: string; status: string }[];

    for (const e of events) {
      const mine = entries.filter((x) => x.event_id === e.id);
      const invited = mine.filter((x) => x.status === "invited").length;
      const undecided = mine.filter((x) => x.status === "undecided").length;
      const entered = mine.filter((x) => x.status === "entered").length;
      if (invited + undecided === 0) continue;

      const deadline = e.answer_deadline_at ?? e.start_at;
      const diffDays = Math.ceil(
        (new Date(deadline).getTime() - nowDate.getTime()) / 86_400_000,
      );
      const when =
        diffDays < 0
          ? `締切を ${-diffDays} 日過ぎています`
          : diffDays === 0
            ? "今日が締切"
            : `締切まで ${diffDays} 日`;
      todos.push({
        key: `event-${e.id}`,
        href: `/admin/events/${e.id}`,
        title: `${e.title} の回答待ち`,
        figure: `${invited + undecided} 名`,
        detail: `未回答 ${invited}・保留 ${undecided}・参加 ${entered}。${when}`,
        tone: diffDays <= 7 ? "warn" : "neutral",
      });
    }
  }

  return {
    todos,
    lessons,
    hasAnyLesson: (anyLesson ?? 0) > 0,
    weekChanges,
    tuition,
    counts: { students, classes, locations },
    setup: {
      needsLocation: locations === 0,
      needsSeason: season === null && !failed.includes("期"),
      needsClass: classes === 0,
    },
    failed: [...new Set(failed)],
  };
}
