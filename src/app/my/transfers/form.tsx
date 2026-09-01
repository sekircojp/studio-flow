"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { submitMyAbsence, type MyAbsenceState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

export function AbsenceRequestForm({
  studentId,
  lessons,
}: {
  studentId: string;
  lessons: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<MyAbsenceState, FormData>(
    submitMyAbsence,
    {},
  );

  if (lessons.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        連絡できるレッスンがありません。すでに連絡済みか、予定がない場合があります。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <div>
        <label htmlFor="my-lesson" className={labelClass}>
          休む回
        </label>
        <select id="my-lesson" name="lesson_id" required className={fieldClass}>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="my-reason" className={labelClass}>
          理由（任意）
        </label>
        <input
          id="my-reason"
          name="reason"
          placeholder="発熱のため"
          className={fieldClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`${primaryButtonClass} w-full py-2.5`}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        欠席を連絡する
      </button>
      {state.message && (
        <p className="rounded-lg bg-sf-ok/10 px-3 py-2 text-[13px] text-sf-ink">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-sf-warn/10 px-3 py-2 text-[13px] text-sf-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
