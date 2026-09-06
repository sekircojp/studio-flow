"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  approveApplication,
  declineApplication,
  type ApplicationState,
} from "./actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/** 承認して生徒にする */
export function ApproveButton({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState<ApplicationState, FormData>(
    approveApplication,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="application_id" value={applicationId} />
      <select
        name="status"
        defaultValue="active"
        aria-label="登録する状態"
        className="rounded-lg border border-sf-border-strong bg-white px-2 py-1.5 text-[13px]"
      >
        <option value="active">在籍として登録</option>
        <option value="trial">体験として登録</option>
      </select>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        承認
      </button>
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}

/** 見送る。行は消さず、状態を変えるだけ */
export function DeclineButton({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState<ApplicationState, FormData>(
    declineApplication,
    {},
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("この申込を見送りにします。よろしいですか。")) {
          e.preventDefault();
        }
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="application_id" value={applicationId} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <X className="size-3.5" aria-hidden />
        )}
        見送る
      </button>
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}
