"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { setTrialStatus, type TrialAdminState } from "./actions";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

const OPTIONS = [
  { value: "pending", label: "承認待ち" },
  { value: "booked", label: "予約確定" },
  { value: "attended", label: "参加した" },
  { value: "no_show", label: "来なかった" },
  { value: "enrolled", label: "入会した" },
  { value: "declined", label: "見送り" },
  { value: "canceled", label: "取り消し" },
];

/**
 * 体験の結果を記録する
 *
 * 選んだ時点で保存する。当日の現場でまとめて触るので、
 * 「選ぶ」と「保存する」の2手間にしない。
 */
export function TrialStatusSelect({
  trialId,
  status,
}: {
  trialId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<TrialAdminState, FormData>(
    setTrialStatus,
    {},
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="trial_id" value={trialId} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="体験の状態"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-sf-border-strong bg-white px-2 py-1.5 text-[13px]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-3.5 animate-spin text-sf-muted" aria-hidden />}
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}

export const TRIAL_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * 承認と見送り
 *
 * 承認待ちの申込にだけ出す。席は申込の時点で押さえてあるので、
 * 承認しても定員を超えることはない（設計書 5.2）。
 * 見送ると、その席がすぐ空く。
 *
 * ★ どちらを押しても、保護者へメールが飛ぶ（設計書 4.6.2）。
 *   押す前にそれが分かるように、ボタンの下に書いておく。あとから
 *   「送るつもりはなかった」となるのが一番まずい。
 */
export function TrialApproval({ trialId }: { trialId: string }) {
  const [state, action, pending] = useActionState<TrialAdminState, FormData>(
    setTrialStatus,
    {},
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="trial_id" value={trialId} />
        <input type="hidden" name="status" value="booked" />
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          承認
        </button>
      </form>

      <form
        action={action}
        onSubmit={(e) => {
          if (
            !confirm(
              "この申込を見送りにします。保護者へお断りのメールが送られます。よろしいですか。",
            )
          ) {
            e.preventDefault();
          }
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="trial_id" value={trialId} />
        <input type="hidden" name="status" value="declined" />
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          <X className="size-3.5" aria-hidden />
          見送る
        </button>
      </form>

      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
      </div>
      <p className="text-[11px] text-sf-muted">
        どちらもメールでお知らせします
      </p>
    </div>
  );
}
