"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  createGuardian,
  createMeasurement,
  type StudentState,
} from "../actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

function Message({ state }: { state: StudentState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.ok) return <p className="text-[13px] text-sf-ok">登録しました</p>;
  return null;
}

export function GuardianForm({ householdId }: { householdId: string }) {
  const [state, action, pending] = useActionState<StudentState, FormData>(
    createGuardian,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="household_id" value={householdId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="g-name" className={labelClass}>
            保護者名
          </label>
          <input id="g-name" name="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="g-rel" className={labelClass}>
            続柄
          </label>
          <input
            id="g-rel"
            name="relationship"
            placeholder="父"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="g-email" className={labelClass}>
            メールアドレス
          </label>
          <input id="g-email" name="email" type="email" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="g-tel" className={labelClass}>
            電話番号
          </label>
          <input id="g-tel" name="tel" type="tel" className={fieldClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="g-emg" className={labelClass}>
            緊急連絡先
          </label>
          <input
            id="g-emg"
            name="emergency_contact"
            className={fieldClass}
            placeholder="祖母 090-0000-0000 など"
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
          保護者を追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/**
 * 採寸の記録
 *
 * 最新値の上書きではなく履歴として積む（設計書 4.3）。
 * 子どもは成長するので、いつ測ったかが分からない数値は使えない。
 */
export function MeasurementForm({ studentId }: { studentId: string }) {
  const [state, action, pending] = useActionState<StudentState, FormData>(
    createMeasurement,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="m-date" className={labelClass}>
            採寸日
          </label>
          <input
            id="m-date"
            name="measured_at"
            type="date"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="m-height" className={labelClass}>
            身長（cm）
          </label>
          <input
            id="m-height"
            name="height"
            type="number"
            step="0.1"
            min="1"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="m-wear" className={labelClass}>
            ウェアサイズ
          </label>
          <input
            id="m-wear"
            name="wear_size"
            placeholder="150 / M"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="m-shoe" className={labelClass}>
            靴のサイズ
          </label>
          <input
            id="m-shoe"
            name="shoe_size"
            type="number"
            step="0.5"
            min="1"
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
          採寸を記録
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
