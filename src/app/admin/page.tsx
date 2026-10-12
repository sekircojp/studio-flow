import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, formatYen, greetingJa, todayInTokyo } from "@/lib/date";
import { billingMonthLabel, monthStart, UNPAID_STATUSES } from "@/lib/billing";
import { Card, EmptyState, SectionHeading, StatCard } from "@/components/ui";
import { LessonFlagBadges } from "@/components/lesson-flags";
import { fetchLessonFlags } from "@/lib/lessons";
import { fetchDashboardTodos } from "@/lib/dashboard";
import { instructorLabel, type InstructorJoin } from "@/lib/instructors";

export const metadata: Metadata = { title: "ダッシュボード" };

/**
 * ダッシュボード
 *
 * 設計書 9章の第一表示は「今月の月謝」。請求はまだ作っていないため、
 * 金額を作り話で埋めず、何が足りないかを出す。
 */
export default async function AdminHome() {
  const { membership, email } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS でも絞られるが、アプリ層でも必ず organization_id で絞る（設計書 3章）
  const count = (table: string, extra?: [string, string]) => {
    let q = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if (extra) q = q.eq(extra[0], extra[1]);
    return q;
  };

  // 現在の期のクラス数。期が未設定なら全件を数える
  const { data: currentSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_current", true)
    .maybeSingle();

  const [students, locations, classes] = await Promise.all([
    count("students", ["status", "active"]),
    count("locations", ["is_active", "true"]),
    currentSeason
      ? count("classes", ["season_id", currentSeason.id])
      : count("classes"),
  ]);

  const needsLocation = (locations.count ?? 0) === 0;
  const name = email?.split("@")[0] ?? "";

  // 本日のレッスン。date は date 型なので、JST の「今日」で引く（設計書 2.1）
  const today = todayInTokyo();
  const [{ data: todayRows }, anyLesson, unrecorded] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, start_at, status, classes(name), rooms(name), lesson_instructors(display_order, instructors(name))",
      )
      .eq("organization_id", orgId)
      .eq("date", today)
      .order("start_at"),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    // 終わったのに出欠が付いていない回。放っておくと振替権が発生せず、
    // 保護者との「休んだのに振替が無い」という食い違いになる
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .lt("date", today)
      .neq("status", "canceled")
      .eq("has_attendance_record", false),
  ]);

  type Joined = {
    id: string;
    start_at: string;
    status: string;
    classes: { name: string } | null;
    rooms: { name: string } | null;
    lesson_instructors: InstructorJoin[] | null;
  };

  const todayLessons = ((todayRows ?? []) as unknown as Joined[]).map((l) => ({
    id: l.id,
    start_at: l.start_at,
    status: l.status,
    className: l.classes?.name ?? "（クラス不明）",
    roomName: l.rooms?.name ?? "",
    instructorName: instructorLabel(l.lesson_instructors) ?? "",
  }));
  const hasAnyLesson = (anyLesson.count ?? 0) > 0;
  const unrecordedLessons = unrecorded.count ?? 0;

  // 欠席連絡・振替は、その日いちばん先に知りたい情報
  const flags = await fetchLessonFlags(
    supabase,
    orgId,
    todayLessons.map((l) => l.id),
  );

  // 第一表示＝今月の月謝（設計書 9章）
  const month = monthStart(today);
  const [{ data: invoices }, { data: openInvoices }, { data: monthPayments }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, total, status, student_id")
        .eq("organization_id", orgId)
        .eq("billing_month", month),
      // 先月以前で、まだ受け取れていない分。
      // 今月の状況は上の紺色の帯が受け持つので、ここでは重ねない。
      // 翌月分は受け取る期日が来ていないので、そもそも数えない
      supabase
        .from("invoices")
        .select("id, total, student_id")
        .eq("organization_id", orgId)
        .lt("billing_month", month)
        .in("status", UNPAID_STATUSES),
      supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("organization_id", orgId),
    ]);

  const invoiceRows = (invoices ?? []) as {
    id: string;
    total: number;
    status: string;
    student_id: string;
  }[];
  const paymentRows = (monthPayments ?? []) as {
    invoice_id: string;
    amount: number;
  }[];
  const paidOf = (invoiceId: string) =>
    paymentRows
      .filter((p) => p.invoice_id === invoiceId)
      .reduce((s, p) => s + p.amount, 0);

  const billable = invoiceRows.filter((i) => i.status !== "canceled");
  const billed = billable.reduce((s, i) => s + i.total, 0);
  const collected = billable.reduce(
    (s, i) => s + Math.min(paidOf(i.id), i.total),
    0,
  );
  const unpaid = billable.filter((i) =>
    UNPAID_STATUSES.includes(i.status as never),
  );
  const unpaidAmount = unpaid.reduce((s, i) => s + (i.total - paidOf(i.id)), 0);
  const collectRate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;

  // 請求は生徒単位なので（設計書 4.5）、人数で数えて構わない
  const targetStudents = new Set(billable.map((i) => i.student_id)).size;

  // 先月以前の未収。今月ぶんは月謝のカードにあるので、ここでは繰り越しだけを見る
  const carriedRows = (openInvoices ?? []) as {
    id: string;
    total: number;
    student_id: string;
  }[];
  const carriedAmount = carriedRows.reduce(
    (s, i) => s + (i.total - paidOf(i.id)),
    0,
  );
  const carriedStudents = new Set(carriedRows.map((i) => i.student_id)).size;

  // 対応待ち。件数が 0 のものは行ごと出ない
  const todos = await fetchDashboardTodos(supabase, orgId, today, formatYen);
  const todoTones: Record<string, string> = {
    warn: "bg-sf-warn/14 text-sf-warn",
    accent: "bg-sf-accent/12 text-sf-accent",
    neutral: "bg-sf-ink/6 text-sf-body",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <p className="sf-kicker">{formatDateJa(new Date())}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
            {greetingJa()}
            {name && <span>、{name} さん</span>}
          </h1>
          <p className="mt-1 text-[13px] text-sf-body">
            対応待ちと今日の予定を確認しましょう
          </p>
        </div>
      </div>


      {/* 対応待ち。運営が手を動かすべきことを上から並べる。今日とは限らない */}
      <Card className="p-5">
        <SectionHeading
          kicker="Pending"
          title="対応待ち"
          action={
            todos.length > 0 ? (
              <span className="sf-num text-[12px] text-sf-muted">
                {todos.length} 件
              </span>
            ) : undefined
          }
        />
        {todos.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-sf-ok/8 px-4 py-3 text-[13px] text-sf-ink">
            <CheckCircle2 className="size-4 text-sf-ok" aria-hidden />
            対応待ちはありません。承認待ちの申込、期限を過ぎた未納、今週の休講・欠席・振替、発表会の回答待ちが出たらここに並びます。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-sf-border rounded-xl border border-sf-border">
            {todos.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-sf-bg"
                >
                  <span
                    className={`sf-num shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-bold ${todoTones[t.tone]}`}
                  >
                    {t.figure}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-sf-ink">
                      {t.title}
                    </span>
                    <span className="block truncate text-[11px] text-sf-muted">
                      {t.detail}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
       * 指標。月謝は「第一表示」ではなく、在籍・クラスと同じ並びの1枚にする
       * （2026-10-12。横長の帯だと集金が主役の画面に見えるため）
       */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          icon={Wallet}
          tone={unpaid.length > 0 ? "warn" : "ok"}
          label={`${billingMonthLabel(month)}の月謝`}
          value={billable.length === 0 ? "—" : formatYen(collected)}
          unit={billable.length === 0 ? undefined : `/ ${formatYen(billed)}`}
          note={
            billable.length === 0
              ? "請求を作ると回収状況が出ます"
              : unpaid.length > 0
                ? `回収率 ${collectRate}%・未納 ${unpaid.length} 名 ${formatYen(unpaidAmount)}`
                : `回収率 ${collectRate}%・${targetStudents} 名すべて入金済み`
          }
          href="/admin/billing"
          className="xl:col-span-2"
        />
        <StatCard
          icon={Users}
          tone="accent"
          label="在籍生徒"
          value={students.count ?? 0}
          unit="名"
          note="休会・退会・体験は含めません"
          href="/admin/students"
        />
        <StatCard
          icon={LayoutGrid}
          tone="ok"
          label="クラス"
          value={classes.count ?? 0}
          unit="クラス"
          note={currentSeason ? undefined : "期が未設定です"}
          href="/admin/classes"
        />
        <StatCard
          icon={ClipboardCheck}
          tone={unrecordedLessons > 0 ? "warn" : "ok"}
          label="出欠が未記録"
          value={unrecordedLessons}
          unit="回"
          note={
            unrecordedLessons > 0
              ? "終わったのに記録が付いていません"
              : "終わった回はすべて記録済みです"
          }
          href="/admin/attendance"
        />
        <StatCard
          icon={AlertCircle}
          tone={carriedAmount > 0 ? "warn" : "ok"}
          label="先月までの未収"
          value={formatYen(carriedAmount)}
          note={
            carriedAmount > 0
              ? `${carriedStudents} 名から未入金`
              : "先月までの分は全額入金済みです"
          }
          href="/admin/billing"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <SectionHeading
            kicker="Today's lessons"
            title="本日のレッスン"
            action={
              <Link
                href="/admin/classes"
                className="text-[12px] text-sf-muted underline"
              >
                クラス一覧
              </Link>
            }
          />
          <div className="mt-4">
            {todayLessons.length === 0 ? (
              <EmptyState
                title={
                  hasAnyLesson
                    ? "本日のレッスンはありません"
                    : "レッスンはまだありません"
                }
                description={
                  hasAnyLesson
                    ? "今日は開催予定のクラスがない日です。"
                    : "期（シーズン）とクラスを登録すると、開催日が自動で作られ、ここに今日の予定が並びます。"
                }
              />
            ) : (
              <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
                {todayLessons.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-sf-bg"
                    >
                      <span className="sf-num w-12 shrink-0 text-[13px] font-semibold text-sf-ink">
                        {formatTimeJa(l.start_at)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-sf-ink">
                          {l.className}
                        </span>
                        <span className="block truncate text-[11px] text-sf-muted">
                          {l.roomName}
                          {l.instructorName ? ` / ${l.instructorName}` : ""}
                        </span>
                      </span>
                      <LessonFlagBadges flags={flags.get(l.id)} />
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                          l.status === "canceled"
                            ? "bg-sf-danger/10 text-sf-danger"
                            : l.status === "held"
                              ? "bg-sf-ok/10 text-sf-ok"
                              : "bg-sf-ink/8 text-sf-body"
                        }`}
                      >
                        {l.status === "canceled"
                          ? "休講"
                          : l.status === "held"
                            ? "実施済"
                            : "予定"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading kicker="Quick actions" title="クイック操作" />
          <ul className="mt-4 space-y-2">
            {[
              {
                href: "/admin/locations",
                icon: Building2,
                label: "スタジオ・ルームを登録",
                hint: needsLocation ? "まだ登録されていません" : undefined,
              },
              {
                href: "/admin/settings",
                icon: Settings,
                label: "基本設定を編集",
                hint: undefined,
              },
            ].map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl border border-sf-border px-3 py-2.5 transition hover:border-sf-accent/50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sf-accent/10 text-sf-accent">
                    <a.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-sf-ink">
                      {a.label}
                    </span>
                    {a.hint && (
                      <span className="block text-[11px] text-sf-warn">
                        {a.hint}
                      </span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-sf-bg p-4">
            <p className="sf-kicker">Next up</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-sf-ink">
              <CalendarDays className="size-4 text-sf-muted" aria-hidden />
              期と休講日の登録
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
              クラスとレッスンの一括生成に必要な土台です。次はここを作ります。
            </p>
          </div>
        </Card>
      </div>

    </div>
  );
}
