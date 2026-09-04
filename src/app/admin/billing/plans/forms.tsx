"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  createContract,
  createPricingPlan,
  type BillingState,
} from "../actions";
import { PAYMENT_METHODS } from "@/lib/billing";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

/**
 * 追加フォームは「ボタンを押してから開く」形にしている。
 *
 * 入力欄を常に開いておくと、一覧より先に目に入って画面の主役が入れ替わる。
 * 普段見たいのは登録済みの一覧なので、追加は隠しておく。
 */
function useDisclosure(ok: boolean | undefined) {
  const [open, setOpen] = useState(false);
  const [lastOk, setLastOk] = useState(ok);

  // 登録できたら閉じる。開いたままだと同じ内容をもう一度押しやすい。
  // useEffect ではなく描画中に合わせている（React 公式の「レンダー中の状態調整」）。
  // 効果として書くと、開いたままの状態が一瞬表示されてから閉じる。
  if (ok !== lastOk) {
    setLastOk(ok);
    if (ok) setOpen(false);
  }

  return { open, setOpen };
}

function Message({ state }: { state: BillingState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.ok) return <p className="text-[13px] text-sf-ok">登録しました</p>;
  return null;
}

function FormActions({
  pending,
  label,
  onCancel,
  state,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  state: BillingState;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {label}
      </button>
      <button type="button" onClick={onCancel} className={secondaryButtonClass}>
        <X className="size-3.5" aria-hidden />
        やめる
      </button>
      <Message state={state} />
    </div>
  );
}

export function PlanForm() {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    createPricingPlan,
    {},
  );
  const { open, setOpen } = useDisclosure(state.ok);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={primaryButtonClass}
      >
        <Plus className="size-4" aria-hidden />
        料金プランを作成
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-xl bg-sf-bg p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="pl-name" className={labelClass}>
            プラン名
          </label>
          <input
            id="pl-name"
            name="name"
            required
            autoFocus
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
      <FormActions
        pending={pending}
        label="このプランを作成"
        onCancel={() => setOpen(false)}
        state={state}
      />
    </form>
  );
}

/**
 * 生徒ごとの月謝を決める
 *
 * プランを選ぶと、その金額が複写される。あとでプランの金額を変えても
 * 登録済みの生徒の月謝は変わらない（設計書 4.5）。
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
  const { open, setOpen } = useDisclosure(state.ok);

  if (students.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        月謝を決められる生徒がいません。生徒を登録するか、既存の月謝を終了してください。
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={primaryButtonClass}
      >
        <Plus className="size-4" aria-hidden />
        生徒の月謝を決める
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-xl bg-sf-bg p-4">
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
      <FormActions
        pending={pending}
        label="この内容で決める"
        onCancel={() => setOpen(false)}
        state={state}
      />
    </form>
  );
}
