"use client";

import { useState, useTransition } from "react";
import { Check, CircleSlash, Minus, PauseCircle, Undo2, X } from "lucide-react";

/**
 * 発表会・イベントの名簿（設計書 4.6.3）
 *
 * ★ 「参加するか」と「当日来たか」を別の行として並べる。
 *   1つにまとめると「出ると言っていたのに来なかった」が表せない。
 *   衣装や立ち位置を用意する発表会では、この区別がいちばん重要になる。
 *
 * ★ 「未回答」のボタンは置かない。
 *   参加にも不参加にも押していなければ未回答だと見れば分かる。押せる選択肢
 *   として並べても、答えを消す操作が増えるだけになる。間違えたときは
 *   別の選択肢を押し直せばよい。
 *
 * ★ 当日の出欠は出席と欠席だけ。
 *   学校ではないので、発表会に何分遅れたかを記録しても使い道がない。
 *
 * ★ 押した瞬間に画面を変え、保存はその裏で走らせる。
 *   当日の会場で「押したのに変わらない」と何度も押されるのを防ぐ。
 *
 * ★ 記録する処理はサーバーアクションを props で受け取る。
 *   管理画面（/admin）と講師の画面（/staff）で認可の入口が違うため、
 *   部品側では決めない。講師には参加可否を渡さない。
 */

export type EntryStatus =
  | "invited"
  | "entered"
  | "undecided"
  | "declined"
  | "canceled";
export type EventAttendance = "present" | "absent" | "unconfirmed";

export type EntryRow = {
  id: string;
  studentName: string;
  studentKana: string | null;
  status: EntryStatus;
  attendance: EventAttendance;
  answeredAt: string | null;
};

/** 押せる選択肢。invited（未回答）は入れない（上のコメントを参照） */
const ENTRY_OPTIONS: {
  value: EntryStatus;
  label: string;
  icon: typeof Check;
  on: string;
}[] = [
  { value: "entered", label: "参加", icon: Check, on: "bg-sf-ok text-white border-sf-ok" },
  { value: "undecided", label: "保留", icon: PauseCircle, on: "bg-sf-warn text-white border-sf-warn" },
  { value: "declined", label: "不参加", icon: X, on: "bg-sf-muted text-white border-sf-muted" },
  { value: "canceled", label: "取消", icon: CircleSlash, on: "bg-sf-danger text-white border-sf-danger" },
];

const ATTENDANCE_OPTIONS: {
  value: EventAttendance;
  label: string;
  icon: typeof Check;
  on: string;
}[] = [
  { value: "present", label: "出席", icon: Check, on: "bg-sf-ok text-white border-sf-ok" },
  { value: "absent", label: "欠席", icon: X, on: "bg-sf-danger text-white border-sf-danger" },
  { value: "unconfirmed", label: "未", icon: Minus, on: "bg-sf-ink text-white border-sf-ink" },
];

export const ENTRY_LABEL: Record<EntryStatus, string> = {
  invited: "未回答",
  entered: "参加",
  undecided: "保留",
  declined: "不参加",
  canceled: "取消",
};

export function EventRoster({
  entries,
  disabled,
  setStatus,
  recordAttendance,
}: {
  entries: EntryRow[];
  disabled: boolean;
  /** 渡さなければ参加可否の行を出さない（講師の画面） */
  setStatus?: (entryId: string, status: EntryStatus) => Promise<void>;
  recordAttendance: (
    entryId: string,
    attendance: EventAttendance,
  ) => Promise<void>;
}) {
  const [status, setStatusState] = useState<Record<string, EntryStatus>>(
    Object.fromEntries(entries.map((e) => [e.id, e.status])),
  );
  const [attendance, setAttendanceState] = useState<
    Record<string, EventAttendance>
  >(Object.fromEntries(entries.map((e) => [e.id, e.attendance])));
  const [, startTransition] = useTransition();

  function markStatus(id: string, value: EntryStatus) {
    if (!setStatus) return;
    setStatusState((m) => ({ ...m, [id]: value }));
    startTransition(() => {
      void setStatus(id, value);
    });
  }

  function markAttendance(id: string, value: EventAttendance) {
    setAttendanceState((m) => ({ ...m, [id]: value }));
    startTransition(() => {
      void recordAttendance(id, value);
    });
  }

  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {entries.map((e) => {
        const current = status[e.id];
        const canceled = current === "canceled";
        return (
          <li
            key={e.id}
            className={`px-3 py-3 sm:px-4 ${canceled ? "opacity-60" : ""}`}
          >
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] font-medium text-sf-ink">
                {e.studentName}
              </span>
              {e.studentKana && (
                <span className="text-[11px] text-sf-muted">{e.studentKana}</span>
              )}
              {/* 未回答はボタンが無いので、状態を文字で見せる */}
              {(current === "invited" || !setStatus) && (
                <span className="text-[11px] text-sf-muted">
                  {ENTRY_LABEL[current]}
                </span>
              )}
            </p>

            {setStatus && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] font-medium text-sf-muted">参加</p>
                <div className="grid grid-cols-4 gap-2">
                  {ENTRY_OPTIONS.map((o) => {
                    const active = current === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => markStatus(e.id, o.value)}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-[13px] font-medium transition disabled:opacity-40 ${
                          active
                            ? o.on
                            : "border-sf-border-strong bg-white text-sf-body hover:border-sf-muted"
                        }`}
                      >
                        <o.icon className="size-4" aria-hidden />
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-2.5">
              <p className="mb-1 text-[11px] font-medium text-sf-muted">
                当日の出欠
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ATTENDANCE_OPTIONS.map((o) => {
                  const active = attendance[e.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      disabled={disabled || canceled}
                      onClick={() => markAttendance(e.id, o.value)}
                      aria-pressed={active}
                      className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-[13px] font-medium transition disabled:opacity-40 ${
                        active
                          ? o.on
                          : "border-sf-border-strong bg-white text-sf-body hover:border-sf-muted"
                      }`}
                    >
                      <o.icon className="size-4" aria-hidden />
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 名簿から外す代わりに「取消」を使う理由を、画面にも短く出しておく */
export function RosterNote() {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-sf-muted">
      <Undo2 className="mt-px size-3.5 shrink-0" aria-hidden />
      名簿から消す操作はありません。出ないことになった生徒は「取消」にして
      ください。誰に声をかけたかが残るので、次の回の名簿を作るときに使えます。
    </p>
  );
}
