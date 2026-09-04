"use client";

import { useActionState, useId, useState } from "react";
import { Loader2, Pause, Play, Plus, RefreshCw, X } from "lucide-react";
import {
  addClassMeeting,
  createClass,
  generateLessons,
  setClassMeetingActive,
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
        {rooms.length === 0 && "「ルーム」"}
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

      <MeetingRows rooms={rooms} />

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

/**
 * 開催枠の入力欄（設計書 4.2）
 *
 * クラスは週に何回開いてもよい。「初級クラス（週2回レッスン）」は
 * 1クラスで、ここに2行入れる。クラス数は行数ではなくクラスの件数で数える。
 *
 * 行ごとにルームを選べるのは、曜日によって使うルームが違うことがあるため。
 * 隔週・月1回のような周期は扱わない。例外的な回はカレンダーから
 * 個別に休講・時間変更して調整する（設計書 5.1）。
 */
function MeetingRows({
  rooms,
  initialRows = 1,
  allowAdd = true,
}: {
  rooms: Option[];
  initialRows?: number;
  allowAdd?: boolean;
}) {
  const uid = useId();
  const [rows, setRows] = useState(() =>
    Array.from({ length: initialRows }, (_, i) => i),
  );

  return (
    <div className="rounded-xl bg-sf-bg p-4">
      <p className={labelClass}>開催する曜日と時間</p>
      <p className="mb-3 text-[11px] text-sf-muted">
        週2回のクラスは、行を2つ入れてください。クラス数は1のままです。
      </p>

      <div className="space-y-2">
        {rows.map((key, index) => (
          <div key={key} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_1.4fr_auto]">
            <select
              name="meeting_day"
              required
              defaultValue={2}
              aria-label={`${index + 1} 行目の曜日`}
              className={fieldClass}
            >
              {DAY_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}曜
                </option>
              ))}
            </select>
            <input
              name="meeting_start"
              type="time"
              required
              aria-label={`${index + 1} 行目の開始時刻`}
              className={fieldClass}
            />
            <input
              name="meeting_end"
              type="time"
              required
              aria-label={`${index + 1} 行目の終了時刻`}
              className={fieldClass}
            />
            <select
              name="meeting_room"
              required
              aria-label={`${index + 1} 行目のルーム`}
              className={fieldClass}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((r) => r.filter((k) => k !== key))}
                aria-label={`${index + 1} 行目を消す`}
                className="flex size-9 items-center justify-center rounded-lg border border-sf-border text-sf-muted transition hover:border-sf-danger hover:text-sf-danger"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <span className="size-9" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {allowAdd && (
        <button
          type="button"
          onClick={() => setRows((r) => [...r, (r[r.length - 1] ?? 0) + 1])}
          className={`${secondaryButtonClass} mt-3`}
          id={`${uid}-add`}
        >
          <Plus className="size-3.5" aria-hidden />
          曜日を追加（週2回以上のクラス）
        </button>
      )}
    </div>
  );
}

/** 既存クラスに開催枠を足す */
export function AddMeetingForm({
  classId,
  rooms,
}: {
  classId: string;
  rooms: Option[];
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    addClassMeeting,
    {},
  );
  const [open, setOpen] = useState(false);
  const [lastOk, setLastOk] = useState(state.ok);

  // 追加できたら閉じる。開いたままだと同じ枠をもう一度押しやすい
  if (state.ok !== lastOk) {
    setLastOk(state.ok);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={secondaryButtonClass}
        >
          <Plus className="size-3.5" aria-hidden />
          曜日を追加
        </button>
        {state.message && (
          <span className="text-[12px] text-sf-ok">{state.message}</span>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="class_id" value={classId} />
      <MeetingRows rooms={rooms} allowAdd={false} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          この曜日を追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClass}
        >
          <X className="size-3.5" aria-hidden />
          やめる
        </button>
        {state.error && (
          <span className="text-[12px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

/**
 * 開催枠の停止・再開
 *
 * 物理削除はしない（CLAUDE.md）。停止しても、出欠を記録した回は残る。
 */
export function MeetingToggleButton({
  meetingId,
  isActive,
  label,
}: {
  meetingId: string;
  isActive: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    setClassMeetingActive,
    {},
  );

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="is_active" value={isActive ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        title={isActive ? `${label} を止める` : `${label} を再開する`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-sf-muted transition hover:bg-sf-ink/5 hover:text-sf-ink"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : isActive ? (
          <Pause className="size-3" aria-hidden />
        ) : (
          <Play className="size-3" aria-hidden />
        )}
        {isActive ? "止める" : "再開"}
      </button>
      {state.error && (
        <span className="text-[11px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}
