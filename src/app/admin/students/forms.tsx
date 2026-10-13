"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createStudent, type StudentState } from "./actions";
import { STUDENT_STATUSES } from "@/lib/students";
import {
  Card,
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { X } from "lucide-react";

const NEW_HOUSEHOLD = "__new__";

/**
 * 「生徒を追加」で開く登録欄
 *
 * 一覧の下に常に置くと、生徒が増えるほど遠くなる。上に置いて、押したときだけ
 * 開く。登録できたら閉じる（続けて兄弟を入れるときはもう一度押す）。
 */
export function AddStudentPanel({
  households,
}: {
  households: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
          <Plus className="size-4" aria-hidden />
          生徒を追加
        </button>
      </div>
    );
  }

  return (
    <Card className="border-sf-accent/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-sf-ink">生徒を追加</h2>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          <X className="size-3.5" aria-hidden />
          閉じる
        </button>
      </div>
      <div className="mt-4">
        <StudentForm households={households} onDone={() => setOpen(false)} />
      </div>
    </Card>
  );
}

/**
 * 生徒の登録フォーム
 *
 * 世帯は「既存から選ぶ」か「新しく作る」。兄弟の入会では既存を選ぶ。
 * 新規のときだけ、世帯名と保護者の欄を出す。常に全部出すと、
 * 兄弟の追加のときに何を入れるべきか分からなくなる。
 */
export function StudentForm({
  households,
  onDone,
}: {
  households: { id: string; name: string }[];
  /** 登録できたときに呼ぶ（開いていた欄を閉じるため） */
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<StudentState, FormData>(
    createStudent,
    {},
  );
  const [lastOk, setLastOk] = useState(state.ok);
  if (state.ok !== lastOk) {
    setLastOk(state.ok);
    if (state.ok) onDone?.();
  }
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
