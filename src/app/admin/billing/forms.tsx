"use client";

import { useActionState, useState } from "react";
import { Loader2, RefreshCw, Wallet, X } from "lucide-react";
import {
  cancelInvoice,
  generateInvoices,
  recordPayment,
  type BillingState,
} from "./actions";
import { PAYMENT_METHODS } from "@/lib/billing";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

/** 月次請求の生成 */
export function GenerateInvoicesButton({
  month,
  hasInvoices,
}: {
  month: string;
  hasInvoices: boolean;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    generateInvoices,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className={hasInvoices ? secondaryButtonClass : primaryButtonClass}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        {hasInvoices ? "未作成分を作る" : "この月の請求を作る"}
      </button>
      {state.message && (
        <span className="text-[12px] text-sf-ok">{state.message}</span>
      )}
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}

/**
 * 入金の登録
 *
 * 現金回収が主経路なので、金額を打ち込む手間を減らす。
 * 残額を初期値にしておき、そのまま押せば完納になる。
 */
export function PaymentForm({
  invoiceId,
  remaining,
  today,
}: {
  invoiceId: string;
  remaining: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    recordPayment,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={secondaryButtonClass}
      >
        <Wallet className="size-3.5" aria-hidden />
        入金を登録
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-xl bg-sf-bg p-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor={`amt-${invoiceId}`}>
            金額（円）
          </label>
          <input
            id={`amt-${invoiceId}`}
            name="amount"
            type="number"
            min={1}
            required
            defaultValue={remaining}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`mth-${invoiceId}`}>
            方法
          </label>
          <select
            id={`mth-${invoiceId}`}
            name="method"
            defaultValue="cash"
            className={fieldClass}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`dat-${invoiceId}`}>
            入金日
          </label>
          <input
            id={`dat-${invoiceId}`}
            name="paid_at"
            type="date"
            defaultValue={today}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          登録する
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClass}
        >
          やめる
        </button>
        {state.error && (
          <span className="text-[12px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

/**
 * 請求の取消
 *
 * 入金済みの請求は編集できないので、取消＋返金記録で対応する（設計書 5.6）。
 * 理由を必須にしているのは、あとから経緯を追えるようにするため。
 */
export function CancelInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    cancelInvoice,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${secondaryButtonClass} text-sf-danger hover:border-sf-danger`}
      >
        <X className="size-3.5" aria-hidden />
        取消
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-xl bg-sf-bg p-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div>
        <label className={labelClass} htmlFor={`rsn-${invoiceId}`}>
          取消の理由（必須）
        </label>
        <input
          id={`rsn-${invoiceId}`}
          name="cancel_reason"
          required
          placeholder="二重請求のため"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${primaryButtonClass} bg-sf-danger`}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          取り消す
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClass}
        >
          やめる
        </button>
        {state.error && (
          <span className="text-[12px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
