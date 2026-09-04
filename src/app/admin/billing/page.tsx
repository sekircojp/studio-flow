import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatYen, todayInTokyo } from "@/lib/date";
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
  PaymentForm,
} from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
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
  const month = /^\d{4}-\d{2}(-\d{2})?$/.test(raw)
    ? monthStart(raw.length === 7 ? `${raw}-01` : raw)
    : monthStart(todayInTokyo());

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: invoices }, { data: payments }, contracts] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, student_id, subtotal, discount_total, total, tax_amount, status, due_date, cancel_reason, students(name)",
        )
        .eq("organization_id", orgId)
        .eq("billing_month", month)
        .order("status"),
      supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("organization_id", orgId),
      supabase
        .from("student_contracts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["active", "suspended_billed"]),
    ]);

  type InvoiceRow = {
    id: string;
    student_id: string;
    subtotal: number;
    discount_total: number;
    total: number;
    tax_amount: number;
    status: string;
    due_date: string | null;
    cancel_reason: string | null;
    students: { name: string } | null;
  };

  const invoiceList = (invoices ?? []) as unknown as InvoiceRow[];
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

  const today = todayInTokyo();

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

      {/* 第一表示＝今月の月謝（設計書 9章） */}
      <div className="overflow-hidden rounded-2xl bg-sf-nav p-6 text-sf-nav-ink">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sf-nav-muted">
          {billingMonthLabel(month)}の月謝
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="sf-num text-3xl font-bold">{formatYen(collected)}</p>
          <p className="sf-num text-sf-nav-muted">/ {formatYen(billed)}</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-sf-ok transition-all"
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
          <span className="text-sf-ok">回収率 {rate}%</span>
          <span className="text-sf-nav-muted">
            請求 {billable.length} 件 / 対象 {contracts.count ?? 0} 名
          </span>
          {unpaidList.length > 0 && (
            <span className="rounded-lg bg-white/10 px-2.5 py-1">
              未納 {unpaidList.length} 名 {formatYen(unpaidAmount)}
            </span>
          )}
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            kicker="Invoices"
            title={`${billingMonthLabel(month)}の請求（${invoiceList.length}）`}
          />
          <GenerateInvoicesButton
            month={month}
            hasInvoices={invoiceList.length > 0}
          />
        </div>

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
            <EmptyState
              title="この月の請求はまだありません"
              description="月謝が決まっている生徒に対して、この月の請求をまとめて作ります。作成済みの月は作り直されません。"
            />
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
