"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { setTrialStatus, type TrialAdminState } from "./actions";

const OPTIONS = [
  { value: "booked", label: "予約済み" },
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
