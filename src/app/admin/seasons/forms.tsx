"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createClosure, createSeason, type SeasonState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

function Message({ state }: { state: SeasonState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.ok) return <p className="text-[13px] text-sf-ok">登録しました</p>;
  return null;
}

export function SeasonForm() {
  const [state, action, pending] = useActionState<SeasonState, FormData>(
    createSeason,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="season-name" className={labelClass}>
          期の名前
        </label>
        <input
          id="season-name"
          name="name"
          required
          placeholder="2026年度 前期"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="season-start" className={labelClass}>
            開始日
          </label>
          <input
            id="season-start"
            name="start_date"
            type="date"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="season-end" className={labelClass}>
            終了日
          </label>
          <input
            id="season-end"
            name="end_date"
            type="date"
            required
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
          期を追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ClosureForm({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<SeasonState, FormData>(
    createClosure,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="closure-date" className={labelClass}>
            日付
          </label>
          <input
            id="closure-date"
            name="date"
            type="date"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="closure-name" className={labelClass}>
            名前
          </label>
          <input
            id="closure-name"
            name="name"
            required
            placeholder="年末年始"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="closure-location" className={labelClass}>
            対象
          </label>
          <select id="closure-location" name="location_id" className={fieldClass}>
            <option value="">全校舎</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}のみ
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          休講日を追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
