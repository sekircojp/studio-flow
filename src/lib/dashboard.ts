import type { SupabaseClient } from "@supabase/supabase-js";
import { UNPAID_STATUSES } from "@/lib/billing";
import { fetchLessonFlags } from "@/lib/lessons";

/**
 * ダッシュボードの「今日やること」
 * ────────────────────────────────────────────────
 * 運営が手を動かすべきことを、件数付きで上から並べる。
 * 件数が 0 のものは行ごと出さない（空の行が並ぶと、見なくなる）。
 *
 *   承認待ちの申込   … 放置すると保護者に返事が行かない
 *   期限を過ぎた未納 … 動くきっかけは「期限を過ぎたか」
 *   今週の予定の異常 … 休講・欠席連絡・振替。今日だけでなく今週で見る
 *   発表会の回答状況 … 期限が近いイベントの未回答・保留
 *
 * ★ "use client" のファイルに置かないこと。Server Component から読む。
 */

export type TodoItem = {
  key: string;
  href: string;
  title: string;
  /** 件数や金額。見出しの右に大きく出す */
  figure: string;
  detail: string;
  tone: "warn" | "accent" | "neutral";
};

/** YYYY-MM-DD に日数を足す。date 型の列を扱うので時刻は持ち込まない */
function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchDashboardTodos(
  supabase: SupabaseClient,
  organizationId: string,
  today: string,
  formatYen: (n: number) => string,
): Promise<TodoItem[]> {
  const weekEnd = shiftDate(today, 6);
  const nowIso = new Date().toISOString();

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    trials,
    applications,
    { data: overdue },
    { data: weekLessons },
    { data: events },
  ] = await Promise.all([
    supabase
      .from("trials")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
    supabase
      .from("enrollment_applications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
    supabase
      .from("invoices")
      .select("id, total, student_id")
      .eq("organization_id", organizationId)
      .in("status", UNPAID_STATUSES)
      .lt("due_date", today),
    supabase
      .from("lessons")
      .select("id, status")
      .eq("organization_id", organizationId)
      .gte("date", today)
      .lte("date", weekEnd),
    // 案内済みで、まだ回答を受け付けているイベント。期限が近い順
    supabase
      .from("events")
      .select("id, title, answer_deadline_at, start_at")
      .eq("organization_id", organizationId)
      .eq("status", "planned")
      .eq("is_public", true)
      .gte("start_at", nowIso)
      .order("answer_deadline_at", { ascending: true, nullsFirst: false })
      .limit(3),
  ]);

  const items: TodoItem[] = [];

  // 1. 承認待ちの申込
  const trialCount = trials.count ?? 0;
  const applicationCount = applications.count ?? 0;
  if (trialCount > 0) {
    items.push({
      key: "trials",
      href: "/admin/students/trials",
      title: "体験・見学の承認待ち",
      figure: `${trialCount} 件`,
      detail: "承認か見送りを押すと、保護者にメールで届きます",
      tone: "accent",
    });
  }
  if (applicationCount > 0) {
    items.push({
      key: "applications",
      href: "/admin/students/applications",
      title: "入会申込の承認待ち",
      figure: `${applicationCount} 件`,
      detail: "承認すると生徒・保護者として登録されます",
      tone: "accent",
    });
  }

  // 2. 支払期限を過ぎた未納
  const overdueRows = (overdue ?? []) as {
    id: string;
    total: number;
    student_id: string;
  }[];
  if (overdueRows.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("invoice_id, amount")
      .eq("organization_id", organizationId)
      .in(
        "invoice_id",
        overdueRows.map((i) => i.id),
      );
    const paid = new Map<string, number>();
    for (const p of (payments ?? []) as { invoice_id: string; amount: number }[]) {
      paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount);
    }
    const amount = overdueRows.reduce(
      (s, i) => s + Math.max(i.total - (paid.get(i.id) ?? 0), 0),
      0,
    );
    const students = new Set(overdueRows.map((i) => i.student_id)).size;
    items.push({
      key: "overdue",
      href: "/admin/billing",
      title: "支払期限を過ぎた未納",
      figure: formatYen(amount),
      detail: `${students} 名・${overdueRows.length} 件。入金があれば登録してください`,
      tone: "warn",
    });
  }

  // 3. 今週の予定の異常
  const lessonRows = (weekLessons ?? []) as { id: string; status: string }[];
  const canceled = lessonRows.filter((l) => l.status === "canceled").length;
  const flags = await fetchLessonFlags(
    supabase,
    organizationId,
    lessonRows.filter((l) => l.status !== "canceled").map((l) => l.id),
  );
  let absences = 0;
  let transfersIn = 0;
  for (const f of flags.values()) {
    absences += f.absences;
    transfersIn += f.transfersIn;
  }
  if (canceled + absences + transfersIn > 0) {
    const parts: string[] = [];
    if (canceled > 0) parts.push(`休講 ${canceled} 回`);
    if (absences > 0) parts.push(`欠席連絡 ${absences} 件`);
    if (transfersIn > 0) parts.push(`振替で来る ${transfersIn} 名`);
    items.push({
      key: "week",
      href: "/admin/calendar",
      title: "今週の予定でいつもと違うこと",
      figure: `${canceled + absences + transfersIn} 件`,
      detail: parts.join(" / "),
      tone: "neutral",
    });
  }

  // 4. 発表会の回答状況
  const eventRows = (events ?? []) as {
    id: string;
    title: string;
    answer_deadline_at: string | null;
    start_at: string;
  }[];
  if (eventRows.length > 0) {
    const { data: entries } = await supabase
      .from("event_entries")
      .select("event_id, status")
      .eq("organization_id", organizationId)
      .in(
        "event_id",
        eventRows.map((e) => e.id),
      );
    const entryRows = (entries ?? []) as { event_id: string; status: string }[];

    for (const e of eventRows) {
      const deadline = e.answer_deadline_at ?? e.start_at;
      // 期限を過ぎたものは「回答待ち」ではないので出さない
      if (deadline < nowIso) continue;

      const mine = entryRows.filter((x) => x.event_id === e.id);
      const invited = mine.filter((x) => x.status === "invited").length;
      const undecided = mine.filter((x) => x.status === "undecided").length;
      const entered = mine.filter((x) => x.status === "entered").length;
      if (invited + undecided === 0) continue;

      const daysLeft = Math.ceil(
        (new Date(deadline).getTime() - Date.now()) / 86_400_000,
      );
      items.push({
        key: `event-${e.id}`,
        href: `/admin/events/${e.id}`,
        title: `${e.title} の回答待ち`,
        figure: `${invited + undecided} 名`,
        detail: `未回答 ${invited}・保留 ${undecided}・参加 ${entered}。期限まで ${daysLeft} 日`,
        tone: daysLeft <= 7 ? "warn" : "neutral",
      });
    }
  }

  return items;
}
