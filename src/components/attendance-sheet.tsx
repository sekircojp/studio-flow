"use client";

import { useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Roster, type AttendanceResult, type AttendanceStatus } from "@/components/roster";
import { primaryButtonClass } from "@/components/ui";

/** 確定処理の返り値。保存した人数と、保存後の全員ぶんの値 */
export type ConfirmResult =
  | { ok: true; saved: number; marks: Record<string, AttendanceStatus> }
  | { ok: false; error: string };

/**
 * 名簿と、入力の進み具合と、「この回の出欠を確定する」をひとまとめにした部品
 *
 * 既定は出席（roster.tsx 参照）。来なかった人だけ押し、最後に確定を押すと
 * まだ押していない人が出席（欠席連絡があれば欠席）として保存される。
 *
 * 進み具合（記録済 N / 対象 M・残り K）は、保存できた値だけで数える。
 * 押した直後の未保存の値で数えると、保存に失敗したときに「完了」と
 * 出てしまう。数え方は src/lib/attendance.ts の progressLabel と同じ。
 */
export function AttendanceSheet({
  lessonId,
  students,
  initial,
  notified,
  disabled,
  record,
  confirm,
}: {
  lessonId: string;
  students: { id: string; name: string; kana: string | null }[];
  initial: Record<string, AttendanceStatus>;
  /** 欠席連絡が来ている生徒の id */
  notified: string[];
  disabled: boolean;
  record: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus,
  ) => Promise<AttendanceResult>;
  confirm: (lessonId: string) => Promise<ConfirmResult>;
}) {
  const [marks, setMarks] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const notifiedSet = new Set(notified);

  const total = students.length;
  const recorded = students.filter(
    (s) => (marks[s.id] ?? "unconfirmed") !== "unconfirmed",
  ).length;
  const remaining = total - recorded;
  const done = total > 0 && remaining === 0;
  const defaultAbsent = students.filter(
    (s) => (marks[s.id] ?? "unconfirmed") === "unconfirmed" && notifiedSet.has(s.id),
  ).length;

  async function handleConfirm() {
    setConfirming(true);
    setNotice(null);
    let result: ConfirmResult;
    try {
      result = await confirm(lessonId);
    } catch {
      result = { ok: false, error: "通信できませんでした。" };
    }
    setConfirming(false);
    if (result.ok) {
      setMarks(result.marks);
      setNotice({
        tone: "ok",
        text:
          result.saved > 0
            ? `${result.saved} 名ぶんを保存し、この回の出欠を確定しました。`
            : "すでに全員ぶん記録されています。",
      });
    } else {
      setNotice({ tone: "error", text: `確定できませんでした。${result.error}` });
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p
          className={`sf-num inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
            done
              ? "bg-sf-ok/12 text-sf-ok"
              : recorded > 0
                ? "bg-sf-warn/14 text-sf-warn"
                : "bg-sf-ink/6 text-sf-body"
          }`}
          role="status"
        >
          {done ? `完了 ${recorded} / ${total}` : `記録済 ${recorded} / ${total}・残り ${remaining}`}
        </p>
        {!done && total > 0 && (
          <p className="text-[12px] text-sf-muted">
            来なかった人だけ押してください。残りは下の「確定」で出席として保存されます。
          </p>
        )}
      </div>

      <Roster
        lessonId={lessonId}
        students={students}
        marks={marks}
        notified={notifiedSet}
        disabled={disabled}
        record={record}
        onSaved={(id, status) => setMarks((m) => ({ ...m, [id]: status }))}
      />

      {total > 0 && !disabled && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={confirming || done}
            className={`${primaryButtonClass} py-2.5`}
          >
            {confirming ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CheckCheck className="size-4" aria-hidden />
            )}
            {done ? "確定済み" : "この回の出欠を確定する"}
          </button>
          {!done && (
            <span className="text-[12px] text-sf-muted">
              残り {remaining} 名を出席
              {defaultAbsent > 0 && `（うち欠席連絡のある ${defaultAbsent} 名は欠席）`}
              として保存します
            </span>
          )}
          {notice && (
            <span
              role="status"
              className={`text-[12px] ${notice.tone === "ok" ? "text-sf-ok" : "text-sf-danger"}`}
            >
              {notice.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
