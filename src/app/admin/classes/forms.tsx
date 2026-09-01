"use client";

import { useActionState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import {
  createClass,
  generateLessons,
  type ClassState,
} from "./actions";
import { DAY_LABELS } from "@/lib/schedule";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

type Option = { id: string; name: string };

export function ClassForm({
  seasons,
  rooms,
  instructors,
}: {
  seasons: Option[];
  rooms: Option[];
  instructors: Option[];
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    createClass,
    {},
  );

  if (seasons.length === 0 || rooms.length === 0) {
    return (
      <p className="text-[13px] text-sf-warn">
        クラスを作るには、先に
        {seasons.length === 0 && "「期」"}
        {seasons.length === 0 && rooms.length === 0 && "と"}
        {rooms.length === 0 && "「部屋」"}
        の登録が必要です。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="cls-name" className={labelClass}>
            クラス名
          </label>
          <input
            id="cls-name"
            name="name"
            required
            placeholder="KIDS HIPHOP 初級"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cls-season" className={labelClass}>
            期
          </label>
          <select id="cls-season" name="season_id" required className={fieldClass}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cls-room" className={labelClass}>
            部屋
          </label>
          <select id="cls-room" name="room_id" required className={fieldClass}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="cls-day" className={labelClass}>
            曜日
          </label>
          <select id="cls-day" name="day_of_week" required className={fieldClass}>
            {DAY_LABELS.map((d, i) => (
              <option key={d} value={i}>
                {d}曜日
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cls-start" className={labelClass}>
            開始時刻
          </label>
          <input
            id="cls-start"
            name="start_time"
            type="time"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cls-end" className={labelClass}>
            終了時刻
          </label>
          <input
            id="cls-end"
            name="end_time"
            type="time"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cls-instructor" className={labelClass}>
            担当講師
          </label>
          <select id="cls-instructor" name="instructor_id" className={fieldClass}>
            <option value="">未定</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="cls-enroll" className={labelClass}>
            在籍定員
          </label>
          <input
            id="cls-enroll"
            name="enrollment_capacity"
            type="number"
            min={1}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-sf-muted">新規入会の可否に使います</p>
        </div>
        <div>
          <label htmlFor="cls-roomcap" className={labelClass}>
            1回の上限
          </label>
          <input
            id="cls-roomcap"
            name="room_capacity"
            type="number"
            min={1}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-sf-muted">体験・振替の受入に使います</p>
        </div>
        <div>
          <label htmlFor="cls-fee" className={labelClass}>
            月謝（税込・円）
          </label>
          <input
            id="cls-fee"
            name="monthly_fee"
            type="number"
            min={0}
            step={1}
            defaultValue={0}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cls-genre" className={labelClass}>
            ジャンル
          </label>
          <input
            id="cls-genre"
            name="genre"
            placeholder="HIPHOP"
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
          クラスを追加
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}

/**
 * レッスンの一括生成ボタン
 *
 * 何度押しても安全な操作だが、出欠済みの回が残ることが分かりにくいので、
 * 結果を必ず文章で返す。
 */
export function GenerateLessonsButton({
  classId,
  hasLessons,
}: {
  classId: string;
  hasLessons: boolean;
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    generateLessons,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="class_id" value={classId} />
      <button
        type="submit"
        disabled={pending}
        className={hasLessons ? secondaryButtonClass : primaryButtonClass}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        {hasLessons ? "作り直す" : "レッスンを作る"}
      </button>
      {state.message && (
        <span className="text-[12px] text-sf-ok">{state.message}</span>
      )}
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}
