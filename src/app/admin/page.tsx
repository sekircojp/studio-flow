import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
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
  const [{ data: todayRows }, anyLesson] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, start_at, status, classes(name), rooms(name), instructors(name)",
      )
      .eq("organization_id", orgId)
      .eq("date", today)
      .order("start_at"),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  type Joined = {
    id: string;
    start_at: string;
    status: string;
    classes: { name: string } | null;
    rooms: { name: string } | null;
    instructors: { name: string } | null;
  };

  const todayLessons = ((todayRows ?? []) as unknown as Joined[]).map((l) => ({
    id: l.id,
    start_at: l.start_at,
    status: l.status,
    className: l.classes?.name ?? "（クラス不明）",
    roomName: l.rooms?.name ?? "",
    instructorName: l.instructors?.name ?? "",
  }));
  const hasAnyLesson = (anyLesson.count ?? 0) > 0;

  // 第一表示＝今月の月謝（設計書 9章）
  const month = monthStart(today);
  const [{ data: invoices }, { data: openInvoices }, { data: monthPayments }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, total, status")
        .eq("organization_id", orgId)
        .eq("billing_month", month),
      // 未納は今月に限らない。先月の取りこぼしこそ見えている必要がある
      supabase
        .from("invoices")
        .select("id, total, student_id")
        .eq("organization_id", orgId)
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

  // 全期間の未納（過去の月を含む）
  const openRows = (openInvoices ?? []) as {
    id: string;
    total: number;
    student_id: string;
  }[];
  const openAmount = openRows.reduce((s, i) => s + (i.total - paidOf(i.id)), 0);
  const openStudents = new Set(openRows.map((i) => i.student_id)).size;

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
            月謝の回収状況と今日のスタジオ運営を確認しましょう
          </p>
        </div>
      </div>

      {/* 第一表示＝今月の月謝（設計書 9章）。まだ請求機能が無いので、その旨を出す */}
      <div className="overflow-hidden rounded-2xl bg-sf-nav p-6 text-sf-nav-ink">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sf-nav-muted">
          {billingMonthLabel(month)}の月謝
        </p>
        {billable.length === 0 ? (
          <>
            <p className="sf-num mt-2 text-3xl font-bold">まだ請求はありません</p>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sf-nav-muted">
              生徒の月謝を決めて「この月の請求を作る」を押すと、ここに回収状況が出ます。
            </p>
            <Link
              href="/admin/billing"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-sf-nav-ink transition hover:bg-white/20"
            >
              <Wallet className="size-3.5" aria-hidden />
              月謝・請求を開く
            </Link>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="sf-num text-3xl font-bold">{formatYen(collected)}</p>
              <p className="sf-num text-sf-nav-muted">/ {formatYen(billed)}</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-sf-ok transition-all"
                style={{ width: `${Math.min(collectRate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
              <span className="text-sf-ok">回収率 {collectRate}%</span>
              <span className="text-sf-nav-muted">請求 {billable.length} 件</span>
              <Link
                href="/admin/billing"
                className="rounded-lg bg-white/10 px-2.5 py-1 transition hover:bg-white/20"
              >
                {unpaid.length > 0
                  ? `未納 ${unpaid.length} 名 ${formatYen(unpaidAmount)} →`
                  : "月謝管理を開く →"}
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Users}
          tone="accent"
          label="在籍生徒"
          value={students.count ?? 0}
          unit="名"
          note="休会・退会・体験は含めません"
        />
        <StatCard
          icon={LayoutGrid}
          tone="ok"
          label="クラス"
          value={classes.count ?? 0}
          unit="クラス"
          note={currentSeason ? "現在の期" : "期が未設定です"}
        />
        <StatCard
          icon={AlertCircle}
          tone={openAmount > 0 ? "warn" : "ok"}
          label="未納の月謝"
          value={formatYen(openAmount)}
          note={
            openAmount > 0
              ? `${openStudents} 名 / 過去の月を含む`
              : "取りこぼしはありません"
          }
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
                    : "期（シーズン）と定期クラスを登録すると、開催日が自動で作られ、ここに今日の予定が並びます。"
                }
              />
            ) : (
              <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
                {todayLessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3">
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
                label: "校舎・部屋を登録",
                hint: needsLocation ? "まだ登録されていません" : undefined,
              },
              {
                href: "/admin/settings",
                icon: Settings,
                label: "スタジオ設定を編集",
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
              定期クラスとレッスンの一括生成に必要な土台です。次はここを作ります。
            </p>
          </div>
        </Card>
      </div>

    </div>
  );
}
