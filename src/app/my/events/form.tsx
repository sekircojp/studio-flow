"use client";

import { useActionState } from "react";
import { Check, Loader2, PauseCircle, X } from "lucide-react";
import { answerEvent, type MyEventState } from "./actions";

/**
 * 保護者の出欠回答（設計書 4.6.3）
 *
 * ★ 「保留」を置く。
 *   発表会は数か月先で、仕事や家族の予定が読めないことが多い。保留が
 *   無いと「とりあえず参加」を押されて、直前に減る。
 *
 * ★ 「未回答」に戻すボタンは置かない。
 *   何も押していない状態が未回答で、押し直せば選び直せる。答えを消す
 *   ためだけのボタンは要らない。
 */

const OPTIONS = [
  {
    value: "entered",
    label: "参加します",
    icon: Check,
    on: "border-sf-ok bg-sf-ok text-white",
  },
  {
    value: "undecided",
    label: "保留",
    icon: PauseCircle,
    on: "border-sf-warn bg-sf-warn text-white",
  },
  {
    value: "declined",
    label: "参加しません",
    icon: X,
    on: "border-sf-muted bg-sf-muted text-white",
  },
] as const;

export function AnswerForm({
  entryId,
  status,
}: {
  entryId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<MyEventState, FormData>(
    answerEvent,
    {},
  );

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="entry_id" value={entryId} />
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = status === o.value;
          return (
            <button
              key={o.value}
              type="submit"
              name="answer"
              value={o.value}
              disabled={pending}
              aria-pressed={active}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1 py-3 text-[13px] font-semibold transition disabled:opacity-40 ${
                active ? o.on : "border-sf-border-strong bg-white text-sf-body"
              }`}
            >
              <o.icon className="size-4" aria-hidden />
              {o.label}
            </button>
          );
        })}
      </div>
      {pending && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-sf-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          送信しています
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-[12px] text-sf-danger">{state.error}</p>
      )}
      {state.ok && (
        <p className="mt-2 text-[12px] text-sf-ok">お返事を承りました</p>
      )}
    </form>
  );
}
