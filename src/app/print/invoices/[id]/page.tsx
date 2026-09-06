import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatYen } from "@/lib/date";
import { billingMonthLabel, paymentMethodLabel } from "@/lib/billing";
import { getBrand } from "@/lib/brand.server";
import { PrintSheet } from "@/components/print-sheet";

export const metadata: Metadata = { title: "請求書・領収書" };

type InvoiceRow = {
  id: string;
  billing_month: string;
  subtotal: number;
  discount_total: number;
  total: number;
  tax_rate: number;
  tax_amount: number;
  due_date: string | null;
  status: string;
  issued_at: string | null;
  student_id: string;
  students: {
    name: string;
    household_id: string;
  } | null;
};

/**
 * 請求書・領収書（設計書 2.2 / 4.1）
 * ────────────────────────────────────────────────
 * ?doc=receipt で領収書、それ以外は請求書。
 *
 * 適格請求書の記載要件（登録している場合）に合わせている。
 *   1. 発行者の名称と登録番号
 *   2. 取引年月日
 *   3. 取引内容
 *   4. 税率ごとに区分した対価の額と適用税率
 *   5. 税率ごとに区分した消費税額
 *   6. 交付を受ける者の名称
 *
 * ★ 登録番号が未入力なら、番号の行そのものを出さない（設計書 4.1）。
 *   免税事業者が「登録番号: —」と書かれた書類を出すと、登録していると
 *   誤解される。
 *
 * ★ 金額は保存された値をそのまま出す。ここで計算し直さない。
 *   税率が変わっても過去の帳票が変わらないようにするため（設計書 2.2）。
 */
export default async function InvoicePrintPage({
  params,
  searchParams,
}: PageProps<"/print/invoices/[id]">) {
  const { membership } = await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const isReceipt = query.doc === "receipt";

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: invoice }, { data: items }, { data: payments }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, billing_month, subtotal, discount_total, total, tax_rate, tax_amount, due_date, status, issued_at, student_id, students(name, household_id)",
        )
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("invoice_items")
        .select("id, kind, description, amount")
        .eq("invoice_id", id)
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("payments")
        .select("id, amount, paid_at, method")
        .eq("invoice_id", id)
        .eq("organization_id", orgId)
        .order("paid_at"),
    ]);

  if (!invoice) notFound();

  const inv = invoice as unknown as InvoiceRow;
  const brand = await getBrand(orgId);

  // 宛名は請求先の保護者。世帯に居なければ生徒名を使う
  const { data: guardian } = await supabase
    .from("guardians")
    .select("name")
    .eq("organization_id", orgId)
    .eq("household_id", inv.students?.household_id ?? "")
    .eq("is_billing_contact", true)
    .maybeSingle();

  const addressee = guardian?.name ?? inv.students?.name ?? "";
  const studentName = inv.students?.name ?? "";
  const monthLabel = billingMonthLabel(inv.billing_month);

  const paymentRows = (payments ?? []) as {
    id: string;
    amount: number;
    paid_at: string;
    method: string;
  }[];
  const paidTotal = paymentRows.reduce((s, p) => s + p.amount, 0);
  const lastPaidAt = paymentRows.at(-1)?.paid_at ?? null;

  const itemRows = (items ?? []) as {
    id: string;
    kind: string;
    description: string;
    amount: number;
  }[];

  const taxPercent = Math.round(inv.tax_rate * 1000) / 10;
  const netAmount = inv.total - inv.tax_amount;

  // 領収書は入金があってこそ成り立つ。無いのに出せてしまうと事故になる
  if (isReceipt && paidTotal === 0) {
    return (
      <PrintSheet backHref="/admin/billing">
        <h1 className="text-lg font-bold">領収書はまだ発行できません</h1>
        <p className="mt-3 text-[13px]">
          この請求にはまだ入金が登録されていません。入金を登録してから、
          もう一度開いてください。
        </p>
      </PrintSheet>
    );
  }

  return (
    <PrintSheet backHref="/admin/billing">
      <h1 className="text-center text-2xl font-bold tracking-[0.3em]">
        {isReceipt ? "領収書" : "請求書"}
      </h1>

      <div className="mt-8 flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <p className="border-b border-black pb-1 text-[15px]">
            {addressee} 様
          </p>
          <p className="mt-4 text-[12px] leading-relaxed">
            {isReceipt
              ? `下記のとおり、${monthLabel}分の月謝を領収いたしました。`
              : `下記のとおり、${monthLabel}分の月謝をご請求申し上げます。`}
          </p>
        </div>

        <div className="shrink-0 text-right text-[12px] leading-relaxed">
          <p>
            {isReceipt
              ? lastPaidAt
                ? formatDateJa(lastPaidAt)
                : ""
              : inv.issued_at
                ? formatDateJa(inv.issued_at)
                : ""}
          </p>
          <p className="mt-2 text-[14px] font-bold">{brand.studioName}</p>
          {brand.postalCode && <p>〒{brand.postalCode}</p>}
          {brand.address && <p>{brand.address}</p>}
          {brand.tel && <p>TEL {brand.tel}</p>}
          {/* 未登録なら行ごと出さない。登録していると誤解されるため */}
          {brand.invoiceRegistrationNumber && (
            <p className="mt-1">
              登録番号 {brand.invoiceRegistrationNumber}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 border-y-2 border-black py-4">
        <div className="flex items-end justify-between">
          <span className="text-[14px]">
            {isReceipt ? "領収金額" : "ご請求金額"}
          </span>
          <span className="sf-num text-3xl font-bold">
            {formatYen(isReceipt ? paidTotal : inv.total)}
          </span>
        </div>
        <p className="mt-1 text-right text-[11px]">（税込）</p>
      </div>

      <p className="mt-6 text-[12px]">
        但し {monthLabel}分 月謝として
        {studentName && `（${studentName} さん）`}
      </p>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-black">
            <th className="py-2 text-left font-medium">内訳</th>
            <th className="py-2 text-right font-medium">金額</th>
          </tr>
        </thead>
        <tbody>
          {itemRows.length === 0 ? (
            <tr className="border-b border-sf-border">
              <td className="py-2">{monthLabel}分 月謝</td>
              <td className="sf-num py-2 text-right">{formatYen(inv.total)}</td>
            </tr>
          ) : (
            itemRows.map((it) => (
              <tr key={it.id} className="border-b border-sf-border">
                <td className="py-2">{it.description}</td>
                <td className="sf-num py-2 text-right">
                  {formatYen(it.amount)}
                </td>
              </tr>
            ))
          )}
          <tr className="border-b-2 border-black">
            <td className="py-2 font-medium">合計（税込）</td>
            <td className="sf-num py-2 text-right font-bold">
              {formatYen(inv.total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 適格請求書は税率ごとの内訳が要る。いまは1つの税率しか持たない */}
      <table className="mt-4 w-full border-collapse text-[12px]">
        <tbody>
          <tr className="border-b border-sf-border">
            <td className="py-1.5">{taxPercent}% 対象</td>
            <td className="sf-num py-1.5 text-right">{formatYen(netAmount)}</td>
          </tr>
          <tr className="border-b border-sf-border">
            <td className="py-1.5">消費税（{taxPercent}%）</td>
            <td className="sf-num py-1.5 text-right">
              {formatYen(inv.tax_amount)}
            </td>
          </tr>
        </tbody>
      </table>

      {isReceipt ? (
        <div className="mt-6 text-[12px]">
          <p className="font-medium">入金の内訳</p>
          <ul className="mt-1">
            {paymentRows.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-sf-border py-1.5">
                <span>
                  {formatDateJa(p.paid_at)} ・ {paymentMethodLabel(p.method)}
                </span>
                <span className="sf-num">{formatYen(p.amount)}</span>
              </li>
            ))}
          </ul>
          {paidTotal < inv.total && (
            <p className="mt-2">
              残額 {formatYen(inv.total - paidTotal)}（この領収書は入金済みの
              分のみを証明するものです）
            </p>
          )}
        </div>
      ) : (
        inv.due_date && (
          <p className="mt-6 text-[12px]">
            お支払期限 {formatDateJa(inv.due_date)}
          </p>
        )
      )}

      {!brand.invoiceRegistrationNumber && (
        <p className="print-hide mt-8 rounded-lg bg-sf-bg p-3 text-[11px] leading-relaxed text-sf-muted">
          適格請求書発行事業者の登録番号が未入力のため、登録番号を印字していません。
          登録している場合は基本設定に入力してください。免税事業者はこのままで
          構いません。
        </p>
      )}
    </PrintSheet>
  );
}
