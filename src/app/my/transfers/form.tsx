"use client";

import { useActionState, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { submitMyAbsence, type MyAbsenceState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

type LessonOption = {
  id: string;
  label: string;
  date: string;
  time: string;
  className: string;
};

/**
 * 欠席連絡のフォーム
 *
 * 予定一覧の「欠席を連絡」から来たときは、その回を選択済みにする
 * （preselected）。送る前に「誰の・いつの・どのクラス」を文章で見せ、
 * 兄弟や回の取り違えに気づけるようにする。
 */
export function AbsenceRequestForm({
  studentId,
  studentName,
  lessons,
  preselected,
}: {
  studentId: string;
  studentName: string;
  lessons: LessonOption[];
  preselected?: string;
}) {
  const [state, action, pending] = useActionState<MyAbsenceState, FormData>(
    submitMyAbsence,
    {},
  );
  const initial =
    preselected && lessons.some((l) => l.id === preselected)
      ? preselected
      : (lessons[0]?.id ?? "");
  const [lessonId, setLessonId] = useState(initial);
  const selected = lessons.find((l) => l.id === lessonId);

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
        <select
          id="my-lesson"
          name="lesson_id"
          required
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          className={fieldClass}
        >
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

      {selected && (
        <p className="rounded-xl bg-sf-bg px-4 py-3 text-[13px] leading-relaxed text-sf-ink">
          <span className="font-semibold">{studentName}</span> さんの
          <span className="sf-num font-semibold">
            {" "}
            {selected.date} {selected.time}
          </span>
          {selected.className && (
            <>
              {" "}
              <span className="font-semibold">{selected.className}</span>
            </>
          )}{" "}
          を欠席として連絡します。
        </p>
      )}

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
