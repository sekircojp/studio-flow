/**
 * 請求の状態（設計書 4.5）
 * ────────────────────────────────────────────────
 * ★ 状態を6つ以上明示的に持つ。
 *   「支払済／未納」の2分割にすると、入金確認待ちや休会中請求停止が
 *   契約件数と合わなくなる。ダッシュボードでは全状態の合計＝
 *   請求対象契約件数で閉じること（設計書 13章）。
 *
 * ★ "use client" のファイルに置かないこと。
 *   Server Component から読むと実体ではなくクライアント参照になる。
 */

export const INVOICE_STATUSES = [
  { value: "draft", label: "下書き", tone: "muted" },
  { value: "issued", label: "未納", tone: "warn" },
  { value: "partially_paid", label: "一部入金", tone: "warn" },
  { value: "awaiting_confirmation", label: "入金確認待ち", tone: "info" },
  { value: "paid", label: "入金済", tone: "ok" },
  { value: "payment_failed", label: "決済失敗", tone: "danger" },
  { value: "suspended", label: "請求停止", tone: "muted" },
  { value: "canceled", label: "取消", tone: "muted" },
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]["value"];

/** 未回収として数える状態 */
export const UNPAID_STATUSES: InvoiceStatus[] = [
  "issued",
  "partially_paid",
  "payment_failed",
];

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function invoiceStatusTone(status: string): string {
  return INVOICE_STATUSES.find((s) => s.value === status)?.tone ?? "muted";
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "現金" },
  { value: "bank_transfer", label: "銀行振込" },
  { value: "card", label: "カード" },
  { value: "other", label: "その他" },
] as const;

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

/** 2026-09-01 → 2026年9月 */
export function billingMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y)}年${Number(m)}月`;
}

/** その月の1日を YYYY-MM-DD で返す */
export function monthStart(date: string): string {
  return date.slice(0, 7) + "-01";
}

/** 月を前後に動かす */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}
