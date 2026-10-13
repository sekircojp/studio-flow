"use client";

import { useActionState, useId, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import {
  addClassMeeting,
  createClass,
  generateLessons,
  setClassInstructors,
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
      </div>

      <InstructorPicker instructors={instructors} />

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
          <p className="mt-1 text-[12px] text-sf-muted">
            この人数まで新しく入会できます
          </p>
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
          <p className="mt-1 text-[12px] text-sf-muted">
            1回に入れる人数。在籍が満席でも、ここまでは体験・振替を受けられます
          </p>
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
 * 担当講師の選択（複数・順番付き）
 *
 * 1クラスに先生が2人付くことは珍しくない（メインとアシスタント、曜日で
 * 交代など）。全員が自分の画面でそのクラスを見て出欠を付けられるよう、
 * 複数選べるようにする。
 *
 * 並びに意味がある。先頭がメインの先生で、一覧や出欠画面ではその順に
 * 名前が並ぶ。選んだ先生は上に順番付きで並び、上下の矢印で入れ替える。
 * まだ選んでいない先生は下に並び、押すと末尾に加わる。
 *
 * フォームには hidden の instructor_ids を並び順どおりに出す。サーバー側は
 * 届いた順をそのまま display_order にする。
 */
function InstructorPicker({
  instructors,
  selected = [],
}: {
  instructors: Option[];
  selected?: string[];
}) {
  // 退職などで選択肢に無い ID は落とす
  const [order, setOrder] = useState<string[]>(() =>
    selected.filter((id) => instructors.some((i) => i.id === id)),
  );

  if (instructors.length === 0) {
    return (
      <div className="rounded-xl bg-sf-bg p-4">
        <p className={labelClass}>担当講師</p>
        <p className="mt-1 text-[12px] text-sf-muted">
          講師が未登録です。担当は、講師を登録したあとからでも付けられます。
        </p>
      </div>
    );
  }

  const nameOf = (id: string) => instructors.find((i) => i.id === id)?.name ?? "—";
  const rest = instructors.filter((i) => !order.includes(i.id));

  const move = (index: number, delta: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      const to = index + delta;
      if (to < 0 || to >= next.length) return o;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const iconButton =
    "flex size-7 items-center justify-center rounded-md border border-sf-border text-sf-muted transition hover:border-sf-border-strong hover:text-sf-ink disabled:opacity-30 disabled:hover:border-sf-border disabled:hover:text-sf-muted";

  return (
    <div className="rounded-xl bg-sf-bg p-4">
      <p className={labelClass}>担当講師</p>
      <p className="mb-3 text-[12px] text-sf-muted">
        複数選べます。先頭の先生がメインとして表示されます。選んだ先生は全員、
        自分の画面でこのクラスの出欠を付けられます。
      </p>

      {order.map((id) => (
        <input key={id} type="hidden" name="instructor_ids" value={id} />
      ))}

      {order.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sf-border-strong/80 px-3 py-2.5 text-[12px] text-sf-muted">
          まだ選んでいません（担当未定）
        </p>
      ) : (
        <ol className="space-y-1.5">
          {order.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-lg border border-sf-border bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(23,28,53,0.05)]"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                  index === 0
                    ? "bg-sf-accent text-sf-accent-ink"
                    : "bg-sf-ink/8 text-sf-body"
                }`}
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sf-ink">
                {nameOf(id)}
                {index === 0 && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sf-accent">
                    Main
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`${nameOf(id)} を上へ`}
                className={iconButton}
              >
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === order.length - 1}
                aria-label={`${nameOf(id)} を下へ`}
                className={iconButton}
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOrder((o) => o.filter((x) => x !== id))}
                aria-label={`${nameOf(id)} を外す`}
                className={`${iconButton} hover:border-sf-danger hover:text-sf-danger`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      {rest.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {rest.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setOrder((o) => [...o, i.id])}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-sf-border-strong/90 bg-white px-3 py-1.5 text-[13px] text-sf-body transition duration-150 hover:border-sf-accent hover:text-sf-ink"
            >
              <Plus className="size-3.5" aria-hidden />
              {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 既存クラスの担当講師を変える */
export function InstructorsForm({
  classId,
  instructors,
  selected,
}: {
  classId: string;
  instructors: Option[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    setClassInstructors,
    {},
  );
  const [open, setOpen] = useState(false);
  const [lastOk, setLastOk] = useState(state.ok);

  // 変更できたら閉じる
  if (state.ok !== lastOk) {
    setLastOk(state.ok);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-sf-accent transition hover:bg-sf-accent/10"
        >
          <Users className="size-3" aria-hidden />
          担当を変更
        </button>
        {state.message && (
          <span className="text-[12px] text-sf-ok">{state.message}</span>
        )}
      </span>
    );
  }

  return (
    <form action={action} className="mt-2 w-full space-y-3">
      <input type="hidden" name="class_id" value={classId} />
      <InstructorPicker instructors={instructors} selected={selected} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          この担当にする
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
      <p className="text-[12px] text-sf-muted">
        まだ予定のままの回に反映されます。出欠を記録した回・実施済みの回の担当はそのまま残ります。
      </p>
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
      <p className="mb-3 text-[12px] text-sf-muted">
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
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-sf-muted transition hover:bg-sf-ink/5 hover:text-sf-ink"
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
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </form>
  );
}
