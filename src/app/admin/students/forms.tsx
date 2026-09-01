"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createStudent, type StudentState } from "./actions";
import { STUDENT_STATUSES } from "@/lib/students";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

const NEW_HOUSEHOLD = "__new__";

/**
 * 生徒の登録フォーム
 *
 * 世帯は「既存から選ぶ」か「新しく作る」。兄弟の入会では既存を選ぶ。
 * 新規のときだけ、世帯名と保護者の欄を出す。常に全部出すと、
 * 兄弟の追加のときに何を入れるべきか分からなくなる。
 */
export function StudentForm({
  households,
}: {
  households: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<StudentState, FormData>(
    createStudent,
    {},
  );
  const [householdId, setHouseholdId] = useState(
    households.length > 0 ? households[0].id : NEW_HOUSEHOLD,
  );
  const isNew = householdId === NEW_HOUSEHOLD;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="st-name" className={labelClass}>
            生徒名
          </label>
          <input id="st-name" name="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="st-kana" className={labelClass}>
            ふりがな
          </label>
          <input id="st-kana" name="name_kana" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="st-birth" className={labelClass}>
            生年月日
          </label>
          <input
            id="st-birth"
            name="birth_date"
            type="date"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="st-grade" className={labelClass}>
            学年
          </label>
          <input
            id="st-grade"
            name="grade"
            placeholder="小3"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="st-gender" className={labelClass}>
            性別
          </label>
          <input
            id="st-gender"
            name="gender"
            placeholder="任意"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="st-enrolled" className={labelClass}>
            入会日
          </label>
          <input
            id="st-enrolled"
            name="enrolled_on"
            type="date"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="st-status" className={labelClass}>
            在籍状態
          </label>
          <select
            id="st-status"
            name="status"
            defaultValue="trial"
            className={fieldClass}
          >
            {STUDENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="st-household" className={labelClass}>
            世帯
          </label>
          <select
            id="st-household"
            name="household_id"
            value={isNew ? "" : householdId}
            onChange={(e) => setHouseholdId(e.target.value || NEW_HOUSEHOLD)}
            className={fieldClass}
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
            <option value="">＋ 新しい世帯を作る</option>
          </select>
          <p className="mt-1 text-[11px] text-sf-muted">
            兄弟の入会は既存の世帯を選びます
          </p>
        </div>
      </div>

      {isNew && (
        <div className="rounded-xl bg-sf-bg p-4">
          <p className="sf-kicker">New household</p>
          <p className="mt-1 text-[12px] text-sf-muted">
            世帯は兄弟割の判定単位です。保護者は後からでも追加できます。
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="hh-name" className={labelClass}>
                世帯名
              </label>
              <input
                id="hh-name"
                name="household_name"
                placeholder="山田家"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="gd-name" className={labelClass}>
                保護者名
              </label>
              <input id="gd-name" name="guardian_name" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="gd-rel" className={labelClass}>
                続柄
              </label>
              <input
                id="gd-rel"
                name="guardian_relationship"
                placeholder="母"
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="gd-email" className={labelClass}>
                保護者のメール
              </label>
              <input
                id="gd-email"
                name="guardian_email"
                type="email"
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="gd-tel" className={labelClass}>
                保護者の電話
              </label>
              <input
                id="gd-tel"
                name="guardian_tel"
                type="tel"
                className={fieldClass}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          生徒を登録
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}
