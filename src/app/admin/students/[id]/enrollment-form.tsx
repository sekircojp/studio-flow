"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createEnrollment, type StudentState } from "../actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * クラスへの在籍を追加する
 *
 * 定員に達しているクラスや、新規入会を止めているクラスは
 * サーバー側で弾かれ、理由が返る（設計書 5.2）。
 */
export function EnrollmentForm({
  studentId,
  classes,
  today,
}: {
  studentId: string;
  classes: { id: string; label: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<StudentState, FormData>(
    createEnrollment,
    {},
  );

  if (classes.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        登録できるクラスがありません。クラスの画面で先に作成してください。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="en-class" className={labelClass}>
            クラス
          </label>
          <select id="en-class" name="class_id" required className={fieldClass}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="en-start" className={labelClass}>
            開始日
          </label>
          <input
            id="en-start"
            name="start_date"
            type="date"
            required
            defaultValue={today}
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
          クラスに登録
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}
