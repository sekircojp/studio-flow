"use client";

import { useActionState } from "react";
import { Check, Loader2, Repeat } from "lucide-react";
import {
  bookTransfer,
  saveTransferSettings,
  submitAbsence,
  type TransferState,
} from "./actions";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

function Message({ state }: { state: TransferState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.message)
    return <p className="text-[13px] text-sf-ok">{state.message}</p>;
  return null;
}

/** 欠席連絡を代理で入れる（保護者からの電話を受けた場合など） */
export function AbsenceForm({
  students,
  lessons,
}: {
  students: { id: string; name: string }[];
  lessons: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<TransferState, FormData>(
    submitAbsence,
    {},
  );

  if (students.length === 0 || lessons.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        生徒と、これから開催されるレッスンの両方が必要です。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="ab-student" className={labelClass}>
            生徒
          </label>
          <select id="ab-student" name="student_id" required className={fieldClass}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ab-lesson" className={labelClass}>
            休む回
          </label>
          <select id="ab-lesson" name="lesson_id" required className={fieldClass}>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ab-reason" className={labelClass}>
            理由
          </label>
          <input
            id="ab-reason"
            name="reason"
            placeholder="発熱のため"
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          欠席を記録
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** 振替権を使って別の回を予約する */
export function BookingForm({
  creditId,
  lessons,
}: {
  creditId: string;
  lessons: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<TransferState, FormData>(
    bookTransfer,
    {},
  );

  if (lessons.length === 0) {
    return (
      <p className="text-[12px] text-sf-muted">振替先の候補がありません。</p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="credit_id" value={creditId} />
      <div className="min-w-[16rem] flex-1">
        <label htmlFor={`bk-${creditId}`} className={labelClass}>
          振替先
        </label>
        <select
          id={`bk-${creditId}`}
          name="lesson_id"
          required
          className={fieldClass}
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Repeat className="size-3.5" aria-hidden />
        )}
        予約する
      </button>
      <div className="basis-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export type TransferSettings = {
  absence_deadline_hours: number;
  credit_valid_days: number;
  monthly_limit: number;
  scope: string;
  restore_on_absence: boolean;
  grant_on_no_contact: boolean;
};

/**
 * 振替ルール（設計書 5.3）
 *
 * 6つの設定値だけで表す。ルールエンジンは作らない。
 */
export function TransferSettingsForm({
  settings,
}: {
  settings: TransferSettings;
}) {
  const [state, action, pending] = useActionState<TransferState, FormData>(
    saveTransferSettings,
    {},
  );

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ts-deadline" className={labelClass}>
            欠席連絡の期限
          </label>
          <div className="flex items-center gap-2">
            <input
              id="ts-deadline"
              name="absence_deadline_hours"
              type="number"
              min={0}
              defaultValue={settings.absence_deadline_hours}
              className={fieldClass}
            />
            <span className="mt-1 shrink-0 text-[12px] text-sf-muted">
              時間前まで
            </span>
          </div>
        </div>
        <div>
          <label htmlFor="ts-valid" className={labelClass}>
            振替権の有効期限
          </label>
          <div className="flex items-center gap-2">
            <input
              id="ts-valid"
              name="credit_valid_days"
              type="number"
              min={1}
              defaultValue={settings.credit_valid_days}
              className={fieldClass}
            />
            <span className="mt-1 shrink-0 text-[12px] text-sf-muted">日間</span>
          </div>
        </div>
        <div>
          <label htmlFor="ts-limit" className={labelClass}>
            月の上限回数
          </label>
          <input
            id="ts-limit"
            name="monthly_limit"
            type="number"
            min={0}
            defaultValue={settings.monthly_limit}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-sf-muted">0 で制限なし</p>
        </div>
        <div>
          <label htmlFor="ts-scope" className={labelClass}>
            振替先の範囲
          </label>
          <select
            id="ts-scope"
            name="scope"
            defaultValue={settings.scope}
            className={fieldClass}
          >
            <option value="same_class">同一クラスのみ</option>
            <option value="same_genre">同ジャンル</option>
            <option value="any_class">全クラス</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-sf-bg p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="restore_on_absence"
            defaultChecked={settings.restore_on_absence}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block text-[13px] font-medium text-sf-ink">
              振替回を欠席したら権利を戻す
            </span>
            <span className="mt-0.5 block text-[12px] text-sf-muted">
              外すと、振替先も休んだ場合に権利は戻りません。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="grant_on_no_contact"
            defaultChecked={settings.grant_on_no_contact}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block text-[13px] font-medium text-sf-ink">
              期限を過ぎた連絡・無断欠席にも振替権を与える
            </span>
            <span className="mt-0.5 block text-[12px] text-sf-muted">
              既定は与えません。期限内の連絡を促すためです。
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-sf-border pt-5">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          保存する
        </button>
        {state.ok && (
          <span className="flex items-center gap-1 text-[13px] text-sf-ok">
            <Check className="size-4" aria-hidden />
            保存しました
          </span>
        )}
        {state.error && (
          <span className="text-[13px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
