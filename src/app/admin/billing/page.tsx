import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ReceiptText, Search, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateJa, formatYen, todayInTokyo } from "@/lib/date";
import {
  billingMonthLabel,
  INVOICE_STATUSES,
  invoiceStatusLabel,
  invoiceStatusTone,
  monthStart,
  shiftMonth,
  UNPAID_STATUSES,
} from "@/lib/billing";
import {
  CancelInvoiceForm,
  GenerateInvoicesButton,
  SendNoticesButton,
  PaymentForm,
} from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
  Hero,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "月謝・請求" };

const TONE_CLASS: Record<string, string> = {
  ok: "bg-sf-ok/12 text-sf-ok",
  info: "bg-sf-accent/12 text-sf-accent",
  warn: "bg-sf-warn/14 text-sf-warn",
  danger: "bg-sf-danger/12 text-sf-danger",
  muted: "bg-sf-ink/8 text-sf-muted",
};

export function InvoiceBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        TONE_CLASS[invoiceStatusTone(status)]
      }`}
    >
      {invoiceStatusLabel(status)}
    </span>
  );
}

/**
 * 月謝・請求（設計書 1.2 の中核価値）
 *
 * 「誰から今月いくら受け取ったか／受け取っていないか」が、手元の帳面より
 * 速く分かる状態を目指す。現金のみの運用で完結することが必須要件（設計書 6.3）。
 */
export default async function BillingPage({
  searchParams,
}: PageProps<"/admin/billing">) {
  const { membership } = await requireAdmin();
  const params = await searchParams;
  const raw = typeof params.month === "string" ? params.month : "";
  const today = todayInTokyo();
  const month = /^\d{4}-\d{2}(-\d{2})?$/.test(raw)
    ? monthStart(raw.length === 7 ? `${raw}-01` : raw)
    : monthStart(today);

  /**
   * 絞り込み（URL に持つので、再読み込みや直接の表示でも条件が残る）
   *   status=unpaid 未入金だけ / status=paid 入金済みだけ
   *   overdue=1     支払期限を過ぎたものだけ
   *   carried=1     先月以前の未入金（月をまたいで並べる。month は無視）
   *   q=            生徒名・ふりがな
   */
  const status = params.status === "unpaid" || params.status === "paid" ? params.status : null;
  const overdue = params.overdue === "1";
  const carried = params.carried === "1";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const filtering = status !== null || overdue || carried || q !== "";

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  let invoiceQuery = supabase
    .from("invoices")
    .select(
      "id, student_id, billing_month, subtotal, discount_total, total, tax_amount, status, due_date, cancel_reason, students(name, name_kana)",
    )
    .eq("organization_id", orgId);
  invoiceQuery = carried
    ? invoiceQuery.lt("billing_month", monthStart(today)).in("status", UNPAID_STATUSES)
    : invoiceQuery.eq("billing_month", month);
  if (status === "unpaid") invoiceQuery = invoiceQuery.in("status", UNPAID_STATUSES);
  if (status === "paid") invoiceQuery = invoiceQuery.eq("status", "paid");
  if (overdue) invoiceQuery = invoiceQuery.lt("due_date", today);

  const [{ data: invoices }, { data: payments }, { data: contracts }] =
    await Promise.all([
      invoiceQuery.order("billing_month", { ascending: false }).order("status"),
      supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("organization_id", orgId),
      // 表示している月の請求対象。月次生成（generate_invoices）と同じ条件で、
      // その月に契約期間がかかっているものだけを数える。期間を見ないと、
      // 過去の月を開いたときに、いまの契約数と比べることになって合わない
      supabase
        .from("student_contracts")
        .select("student_id")
        .eq("organization_id", orgId)
        .in("status", ["active", "suspended_billed"])
        .lt("start_date", shiftMonth(month, 1))
        .or(`end_date.is.null,end_date.gte.${month}`),
    ]);

  // 請求は生徒単位（設計書 4.5）なので、契約の件数ではなく生徒の人数で数える
  const targetCount = new Set(
    ((contracts ?? []) as { student_id: string }[]).map((c) => c.student_id),
  ).size;

  type InvoiceRow = {
    id: string;
    student_id: string;
    billing_month: string;
    subtotal: number;
    discount_total: number;
    total: number;
    tax_amount: number;
    status: string;
    due_date: string | null;
    cancel_reason: string | null;
    students: { name: string; name_kana: string | null } | null;
  };

  // 名前の絞り込みは取ってきてから行う（結合先の列で DB 側に条件を付けると、
  // 一致しない行が null の結合になって残るため）
  const invoiceList = ((invoices ?? []) as unknown as InvoiceRow[]).filter((i) =>
    q === ""
      ? true
      : (i.students?.name ?? "").includes(q) || (i.students?.name_kana ?? "").includes(q),
  );
  const paymentList = (payments ?? []) as { invoice_id: string; amount: number }[];

  const paidOf = (invoiceId: string) =>
    paymentList
      .filter((p) => p.invoice_id === invoiceId)
      .reduce((s, p) => s + p.amount, 0);

  const billable = invoiceList.filter((i) => i.status !== "canceled");
  const billed = billable.reduce((s, i) => s + i.total, 0);
  const collected = billable.reduce((s, i) => s + Math.min(paidOf(i.id), i.total), 0);
  const unpaidList = billable.filter((i) => UNPAID_STATUSES.includes(i.status as never));
  const unpaidAmount = unpaidList.reduce((s, i) => s + (i.total - paidOf(i.id)), 0);
  const rate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;

  // 設計書 13章: 全状態の合計＝請求対象契約件数で閉じること
  const byStatus = INVOICE_STATUSES.map((s) => ({
    ...s,
    count: invoiceList.filter((i) => i.status === s.value).length,
  })).filter((s) => s.count > 0);

  // 絞り込みの表示と解除。月だけは残す
  const chips: { label: string; without: string }[] = [];
  const link = (omit: string, add?: [string, string]) => {
    const p = new URLSearchParams();
    if (!carried || omit === "carried") p.set("month", month);
    if (status && omit !== "status") p.set("status", status);
    if (overdue && omit !== "overdue") p.set("overdue", "1");
    if (carried && omit !== "carried") p.set("carried", "1");
    if (q && omit !== "q") p.set("q", q);
    if (add) p.set(add[0], add[1]);
    return `/admin/billing?${p.toString()}`;
  };
  if (carried) chips.push({ label: "先月以前の未入金", without: link("carried") });
  if (status === "unpaid") chips.push({ label: "未入金のみ", without: link("status") });
  if (status === "paid") chips.push({ label: "入金済みのみ", without: link("status") });
  if (overdue) chips.push({ label: "支払期限を過ぎたもの", without: link("overdue") });
  if (q) chips.push({ label: `「${q}」で検索`, without: link("q") });
  const toggleClass = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] transition ${
      on
        ? "border-sf-accent bg-sf-accent/10 text-sf-ink"
        : "border-sf-border-strong text-sf-body hover:border-sf-muted"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <p className="sf-kicker">Finance</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
            月謝・請求
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
            誰から受け取ったか、受け取っていないかを一覧で確認します。
            現金の回収だけでも運用が完結します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/billing?month=${shiftMonth(month, -1)}`}
            className={secondaryButtonClass}
          >
            前の月
          </Link>
          <Link
            href={`/admin/billing?month=${monthStart(today)}`}
            className={secondaryButtonClass}
          >
            今月
          </Link>
          <Link
            href={`/admin/billing?month=${shiftMonth(month, 1)}`}
            className={secondaryButtonClass}
          >
            次の月
          </Link>
        </div>
      </div>

      {/* その月の集計。先月以前をまたいで見ているときは月の集計にならないので出さない */}
      {!carried && (
      <Hero>
        <p className="sf-kicker text-sf-nav-muted">
          {billingMonthLabel(month)}の月謝
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="sf-num text-3xl font-bold">{formatYen(collected)}</p>
          <p className="sf-num text-sf-nav-muted">/ {formatYen(billed)}</p>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/12">
          <div
            className="h-full rounded-full bg-sf-ok transition-all duration-700"
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
          <span className="text-sf-ok">回収率 {rate}%</span>
          <span className="text-sf-nav-muted">
            請求 {billable.length} 件 / 対象 {targetCount} 名
          </span>
          {unpaidList.length > 0 && (
            <span className="rounded-lg bg-white/10 px-2.5 py-1">
              未納 {unpaidList.length} 名 {formatYen(unpaidAmount)}
            </span>
          )}
        </div>
      </Hero>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title={
              carried
                ? `先月以前の未入金（${invoiceList.length}）`
                : `${billingMonthLabel(month)}の請求（${invoiceList.length}）`
            }
          />
          {!carried && (
            <div className="flex flex-wrap items-center gap-3">
              <GenerateInvoicesButton
                month={month}
                hasInvoices={invoiceList.length > 0}
              />
              {invoiceList.length > 0 && <SendNoticesButton month={month} />}
            </div>
          )}
        </div>

        {/* 絞り込み。条件は URL に残り、1つずつ外せる */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form method="get" action="/admin/billing" className="flex items-center gap-2">
            {!carried && <input type="hidden" name="month" value={month} />}
            {status && <input type="hidden" name="status" value={status} />}
            {overdue && <input type="hidden" name="overdue" value="1" />}
            {carried && <input type="hidden" name="carried" value="1" />}
            <label htmlFor="billing-q" className="sr-only">生徒名で探す</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sf-muted" aria-hidden />
              <input
                id="billing-q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="生徒名・ふりがな"
                className="w-48 rounded-lg border border-sf-border-strong/90 bg-white py-1.5 pl-8 pr-2 text-[13px] text-sf-ink outline-none transition focus:border-sf-accent focus:ring-4 focus:ring-sf-accent/15"
              />
            </div>
          </form>
          {!carried && (
            <>
              <Link
                href={status === "unpaid" ? link("status") : link("status", ["status", "unpaid"])}
                className={toggleClass(status === "unpaid")}
              >
                未入金のみ
              </Link>
              <Link
                href={overdue ? link("overdue") : link("overdue", ["overdue", "1"])}
                className={toggleClass(overdue)}
              >
                期限超過のみ
              </Link>
              <Link href="/admin/billing?carried=1" className={toggleClass(false)}>
                先月以前の未入金
              </Link>
            </>
          )}
        </div>
        {filtering && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-sf-body">
            絞り込み中:
            {chips.map((c) => (
              <Link
                key={c.label}
                href={c.without}
                className="inline-flex items-center gap-1 rounded-md bg-sf-ink/6 px-2 py-0.5 text-sf-ink hover:bg-sf-ink/10"
                title="この条件を外す"
              >
                {c.label}
                <X className="size-3" aria-hidden />
              </Link>
            ))}
            <Link href={`/admin/billing?month=${carried ? monthStart(today) : month}`} className="underline">
              すべて解除
            </Link>
          </p>
        )}

        {byStatus.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {byStatus.map((s) => (
              <span
                key={s.value}
                className={`rounded-md px-1.5 py-0.5 font-medium ${TONE_CLASS[s.tone]}`}
              >
                {s.label} {s.count}
              </span>
            ))}
          </p>
        )}

        <div className="mt-4">
          {invoiceList.length === 0 ? (
            filtering ? (
              <EmptyState
                title="条件に合う請求はありません"
                description="絞り込みを外すと、この月のすべての請求が並びます。"
              />
            ) : (
              <EmptyState
                title="この月の請求はまだありません"
                description="月謝が決まっている生徒に対して、この月の請求をまとめて作ります。作成済みの月は作り直されません。"
              />
            )
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {invoiceList.map((i) => {
                const paid = paidOf(i.id);
                const remaining = Math.max(i.total - paid, 0);
                const canceled = i.status === "canceled";

                return (
                  <li
                    key={i.id}
                    className={`px-4 py-3 ${canceled ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sf-ink">
                            {i.students?.name ?? "（生徒不明）"}
                          </span>
                          <InvoiceBadge status={i.status} />
                          {carried && (
                            <span className="sf-num text-[12px] text-sf-muted">
                              {billingMonthLabel(i.billing_month)}分
                            </span>
                          )}
                          {!canceled &&
                            i.due_date !== null &&
                            i.due_date < today &&
                            remaining > 0 && (
                              <span className="sf-num rounded-md bg-sf-warn/14 px-1.5 py-0.5 text-[11px] font-medium text-sf-warn">
                                期限 {formatShortDateJa(i.due_date)} 超過
                              </span>
                            )}
                        </span>
                        <span className="sf-num mt-0.5 block text-[12px] text-sf-muted">
                          請求 {formatYen(i.total)}
                          {i.discount_total > 0 &&
                            `（割引 ${formatYen(i.discount_total)}）`}
                          {" ・ 内消費税 "}
                          {formatYen(i.tax_amount)}
                          {paid > 0 && ` ・ 入金 ${formatYen(paid)}`}
                          {remaining > 0 && !canceled && (
                            <span className="text-sf-warn">
                              {" ・ 残 "}
                              {formatYen(remaining)}
                            </span>
                          )}
                        </span>
                        {canceled && i.cancel_reason && (
                          <span className="mt-0.5 block text-[11px] text-sf-muted">
                            取消理由: {i.cancel_reason}
                          </span>
                        )}
                      </span>

                      {!canceled && (
                        <span className="flex items-center gap-2 text-[12px]">
                          <Link
                            href={`/print/invoices/${i.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
                          >
                            <FileText className="size-3.5" aria-hidden />
                            請求書
                          </Link>
                          {/* 入金前でも刷れる。当日に手渡すため（設計書 10.6） */}
                          <Link
                            href={`/print/invoices/${i.id}?doc=receipt`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
                          >
                            <ReceiptText className="size-3.5" aria-hidden />
                            領収書
                          </Link>
                        </span>
                      )}

                      {!canceled && remaining > 0 && (
                        <PaymentForm
                          invoiceId={i.id}
                          remaining={remaining}
                          today={today}
                        />
                      )}
                      {/* 入金済みの請求は編集不可。取消＋返金で対応する（設計書 5.6） */}
                      {!canceled && paid === 0 && (
                        <CancelInvoiceForm invoiceId={i.id} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <p className="flex flex-wrap gap-4 text-[12px] text-sf-muted">
        <Link href="/admin/billing/plans" className="underline">
          料金プランと月謝
        </Link>
        <Link href="/admin/billing/settings" className="underline">
          兄弟割・支払期限の設定
        </Link>
      </p>
    </div>
  );
}
