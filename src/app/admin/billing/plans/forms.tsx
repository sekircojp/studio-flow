"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  createContract,
  createPricingPlan,
  type BillingState,
} from "../actions";
import { PAYMENT_METHODS } from "@/lib/billing";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

function Message({ state }: { state: BillingState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.ok) return <p className="text-[13px] text-sf-ok">登録しました</p>;
  return null;
}

export function PlanForm() {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    createPricingPlan,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="pl-name" className={labelClass}>
            プラン名
          </label>
          <input
            id="pl-name"
            name="name"
            required
            placeholder="週1回コース"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="pl-amount" className={labelClass}>
            月額（税込・円）
          </label>
          <input
            id="pl-amount"
            name="monthly_amount"
            type="number"
            min={0}
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="pl-enroll" className={labelClass}>
            入会金（円）
          </label>
          <input
            id="pl-enroll"
            name="enrollment_fee"
            type="number"
            min={0}
            defaultValue={0}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="pl-annual" className={labelClass}>
            年会費（円）
          </label>
          <input
            id="pl-annual"
            name="annual_fee"
            type="number"
            min={0}
            defaultValue={0}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          プランを追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/**
 * 月謝契約
 *
 * プランを選ぶと、その金額が契約に複写される。あとでプランの金額を変えても
 * 契約済みの生徒の月謝は変わらない（設計書 4.5）。
 * 金額欄を空にするとプランの値をそのまま使い、入れると個別の金額になる。
 */
export function ContractForm({
  students,
  plans,
  today,
}: {
  students: { id: string; name: string }[];
  plans: { id: string; name: string; monthly_amount: number }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    createContract,
    {},
  );

  if (students.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        契約を作れる生徒がいません。生徒を登録するか、既存の契約を終了してください。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="ct-student" className={labelClass}>
            生徒
          </label>
          <select id="ct-student" name="student_id" required className={fieldClass}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ct-plan" className={labelClass}>
            料金プラン
          </label>
          <select id="ct-plan" name="pricing_plan_id" className={fieldClass}>
            <option value="">使わない（個別に入力）</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.monthly_amount.toLocaleString("ja-JP")}円）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ct-amount" className={labelClass}>
            月謝（税込・円）
          </label>
          <input
            id="ct-amount"
            name="monthly_amount"
            type="number"
            min={0}
            placeholder="プランの金額"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="ct-method" className={labelClass}>
            支払方法
          </label>
          <select
            id="ct-method"
            name="payment_method"
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
          <label htmlFor="ct-start" className={labelClass}>
            開始日
          </label>
          <input
            id="ct-start"
            name="start_date"
            type="date"
            required
            defaultValue={today}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          契約を作る
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
