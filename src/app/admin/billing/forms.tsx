"use client";

import { useActionState, useCallback, useState } from "react";
import { Loader2, Mail, RefreshCw, Wallet, X } from "lucide-react";
import {
  cancelInvoice,
  generateInvoices,
  recordPayment,
  sendInvoiceNotices,
  type BillingState,
} from "./actions";
import { PAYMENT_METHODS } from "@/lib/billing";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { Modal } from "@/components/modal";

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
 * 請求のお知らせメール（設計書 5.4 / 11章）
 *
 * 既に送れている請求は飛ばされるので、押し直しても二重には届かない。
 * 保護者が未登録・メール未入力の生徒は「送れなかった件数」として返る。
 */
export function SendNoticesButton({ month }: { month: string }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    sendInvoiceNotices,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className={secondaryButtonClass}
        title="請求先の保護者に、金額と支払期限をメールで知らせます"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Mail className="size-3.5" aria-hidden />
        )}
        お知らせを送る
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
  studentName,
  remaining,
  today,
}: {
  invoiceId: string;
  studentName: string;
  remaining: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    recordPayment,
    {},
  );
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // 登録できたら閉じる。一覧の残額と集計はサーバー側で更新される
  const [lastOk, setLastOk] = useState(state.ok);
  if (state.ok !== lastOk) {
    setLastOk(state.ok);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${primaryButtonClass} px-3 py-1.5 text-[13px]`}
      >
        <Wallet className="size-3.5" aria-hidden />
        入金を登録
      </button>
      {state.ok && state.message && (
        <span className="ml-2 text-[12px] text-sf-ok">{state.message}</span>
      )}
      {open && (
        <Modal
          title="入金を登録"
          description={`${studentName} さん・残額 ${remaining.toLocaleString("ja-JP")} 円`}
          onClose={close}
        >
          <form action={action} className="space-y-4">
            <input type="hidden" name="invoice_id" value={invoiceId} />
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
              <p className="mt-1 text-[12px] text-sf-muted">
                そのまま登録すると完納になります。一部だけ受け取った場合は金額を直してください。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              {state.error && (
                <span className="mr-auto text-[12px] text-sf-danger">{state.error}</span>
              )}
              <button type="button" onClick={close} className={secondaryButtonClass}>
                やめる
              </button>
              <button type="submit" disabled={pending} className={primaryButtonClass}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                登録する
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/**
 * 請求の取消
 *
 * 入金済みの請求は編集できないので、取消＋返金記録で対応する（設計書 5.6）。
 * 理由を必須にしているのは、あとから経緯を追えるようにするため。
 */
export function CancelInvoiceForm({
  invoiceId,
  studentName,
}: {
  invoiceId: string;
  studentName: string;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    cancelInvoice,
    {},
  );
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [lastOk, setLastOk] = useState(state.ok);
  if (state.ok !== lastOk) {
    setLastOk(state.ok);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-sf-muted transition hover:bg-sf-danger/10 hover:text-sf-danger"
        title="この請求を取り消す（入金前のみ）"
      >
        <X className="size-3.5" aria-hidden />
        取消
      </button>
      {open && (
        <Modal
          title="請求を取り消す"
          description={`${studentName} さんのこの請求を取り消します。物理削除はせず、取消として残ります。`}
          onClose={close}
        >
          <form action={action} className="space-y-4">
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
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              {state.error && (
                <span className="mr-auto text-[12px] text-sf-danger">{state.error}</span>
              )}
              <button type="button" onClick={close} className={secondaryButtonClass}>
                やめる
              </button>
              <button
                type="submit"
                disabled={pending}
                className={`${primaryButtonClass} bg-sf-danger`}
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                取り消す
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
