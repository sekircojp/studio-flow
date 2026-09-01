import type { Metadata } from "next";
import { pickStudent, requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatYen } from "@/lib/date";
import {
  billingMonthLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  paymentMethodLabel,
} from "@/lib/billing";
import { StudentSwitch } from "@/components/student-switch";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "月謝" };

const TONE_CLASS: Record<string, string> = {
  ok: "bg-sf-ok/12 text-sf-ok",
  info: "bg-sf-accent/12 text-sf-accent",
  warn: "bg-sf-warn/14 text-sf-warn",
  danger: "bg-sf-danger/12 text-sf-danger",
  muted: "bg-sf-ink/8 text-sf-muted",
};

/**
 * 保護者の月謝確認（設計書 9章 項目10）
 *
 * 見えるのは自世帯の請求だけ。RLS でも絞られるが、アプリ層でも生徒で絞る。
 * 金額の内訳（割引・消費税）まで出すのは、問い合わせを減らすため。
 */
export default async function MyBillingPage({
  searchParams,
}: PageProps<"/my/billing">) {
  const { membership, students } = await requireMy();
  const params = await searchParams;
  const requested = typeof params.student === "string" ? params.student : undefined;
  const student = pickStudent(students, requested);

  if (!student) {
    return (
      <EmptyState
        title="表示できる生徒がいません"
        description="スタジオにお問い合わせください。"
      />
    );
  }

  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, billing_month, subtotal, discount_total, total, tax_amount, status, due_date",
    )
    .eq("student_id", student.id)
    .eq("organization_id", orgId)
    .neq("status", "draft")
    .order("billing_month", { ascending: false })
    .limit(12);

  const invoiceList = (invoices ?? []) as {
    id: string;
    billing_month: string;
    subtotal: number;
    discount_total: number;
    total: number;
    tax_amount: number;
    status: string;
    due_date: string | null;
  }[];

  const { data: payments } =
    invoiceList.length > 0
      ? await supabase
          .from("payments")
          .select("invoice_id, amount, method, paid_at")
          .in(
            "invoice_id",
            invoiceList.map((i) => i.id),
          )
      : { data: [] };

  const paymentList = (payments ?? []) as {
    invoice_id: string;
    amount: number;
    method: string;
    paid_at: string;
  }[];

  const paidOf = (id: string) =>
    paymentList.filter((p) => p.invoice_id === id).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <StudentSwitch
        students={students}
        currentId={student.id}
        basePath="/my/billing"
      />

      <div>
        <p className="sf-kicker">Billing</p>
        <h1 className="mt-1 text-xl font-bold text-sf-ink">
          {student.name} さんの月謝
        </h1>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionHeading kicker="Invoices" title="請求の履歴" />
        <div className="mt-4">
          {invoiceList.length === 0 ? (
            <EmptyState
              title="請求はまだありません"
              description="請求が作られると、ここに月ごとに並びます。"
            />
          ) : (
            <ul className="space-y-3">
              {invoiceList.map((i) => {
                const paid = paidOf(i.id);
                const remaining = Math.max(i.total - paid, 0);
                const mine = paymentList.filter((p) => p.invoice_id === i.id);

                return (
                  <li
                    key={i.id}
                    className="rounded-xl border border-sf-border p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-[15px] font-bold text-sf-ink">
                        {billingMonthLabel(i.billing_month)}
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                          TONE_CLASS[invoiceStatusTone(i.status)]
                        }`}
                      >
                        {invoiceStatusLabel(i.status)}
                      </span>
                    </div>

                    <p className="sf-num mt-2 text-2xl font-bold text-sf-ink">
                      {formatYen(i.total)}
                    </p>
                    <p className="sf-num mt-1 text-[12px] text-sf-muted">
                      {i.discount_total > 0 &&
                        `月謝 ${formatYen(i.subtotal)} ・ 割引 ${formatYen(i.discount_total)} ・ `}
                      内消費税 {formatYen(i.tax_amount)}
                      {i.due_date && ` ・ お支払期限 ${formatDateJa(i.due_date)}`}
                    </p>

                    {mine.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-sf-border pt-3">
                        {mine.map((p, idx) => (
                          <li
                            key={idx}
                            className="sf-num flex items-center gap-3 text-[12px] text-sf-body"
                          >
                            <span>{formatDateJa(p.paid_at)}</span>
                            <span className="flex-1">
                              {paymentMethodLabel(p.method)}
                            </span>
                            <span className="font-medium">
                              {formatYen(p.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {remaining > 0 && i.status !== "canceled" && (
                      <p className="sf-num mt-2 text-[13px] font-medium text-sf-warn">
                        未納 {formatYen(remaining)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
