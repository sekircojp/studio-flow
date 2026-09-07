"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createEvent, type EventState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 発表会・イベントの登録（設計書 4.6）
 *
 * ★ 会場は自由入力にしてある。
 *   発表会は市民ホールなど、普段のスタジオ以外で開かれるのが普通で、
 *   1回きりの会場をスタジオとして登録させるのは筋が悪い（移行 038）。
 */
export function EventForm() {
  const [state, action, pending] = useActionState<EventState, FormData>(
    createEvent,
    {},
  );
  const [kind, setKind] = useState("recital");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-kind" className={labelClass}>
            種類
          </label>
          <select
            id="event-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={fieldClass}
          >
            <option value="recital">発表会</option>
            <option value="event">イベント（合宿・ワークショップなど）</option>
          </select>
        </div>
        <div>
          <label htmlFor="event-title" className={labelClass}>
            名前 <span className="text-sf-danger">必須</span>
          </label>
          <input
            id="event-title"
            name="title"
            required
            placeholder={kind === "recital" ? "第5回 発表会" : "夏合宿"}
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-venue" className={labelClass}>
            会場
          </label>
          <input
            id="event-venue"
            name="venue"
            placeholder="岡崎市民会館 あおいホール"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-sf-muted">
            普段のスタジオ以外でも開けるよう、自由に入力できます。
          </p>
        </div>
        <div>
          <label htmlFor="event-start" className={labelClass}>
            開始日時 <span className="text-sf-danger">必須</span>
          </label>
          <input
            id="event-start"
            name="start_at"
            type="datetime-local"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-end" className={labelClass}>
            終了日時
          </label>
          <input
            id="event-end"
            name="end_at"
            type="datetime-local"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-capacity" className={labelClass}>
            定員
          </label>
          <input
            id="event-capacity"
            name="capacity"
            inputMode="numeric"
            placeholder="空欄なら上限なし"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-price" className={labelClass}>
            参加費（税込・円）
          </label>
          <input
            id="event-price"
            name="price"
            inputMode="numeric"
            placeholder="空欄なら無料"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            名簿に記録するだけで、月謝の請求にはまだ載りません。
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-description" className={labelClass}>
            案内文
          </label>
          <textarea
            id="event-description"
            name="description"
            rows={3}
            placeholder="持ち物、集合時間、駐車場のご案内など"
            className="mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-2.5 py-2 text-[14px] leading-relaxed text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-xl bg-sf-bg px-3 py-2.5">
        <input
          type="checkbox"
          name="is_public"
          defaultChecked
          className="mt-0.5 size-4"
        />
        <span className="text-[13px] leading-relaxed text-sf-body">
          保護者のマイページに出して、出欠を答えてもらう
          <span className="mt-0.5 block text-[11px] text-sf-muted">
            外すと、運営だけが見える下書きになります。会場や日時が固まるまでは
            外しておけます。
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          登録する
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}
