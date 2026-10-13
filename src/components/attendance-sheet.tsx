"use client";

import { useState } from "react";
import { Roster, type AttendanceResult, type AttendanceStatus } from "@/components/roster";

/**
 * 名簿と、入力の進み具合をひとまとめにした部品
 *
 * 進み具合（記録済 N / 対象 M・残り K）は、保存できた値だけで数える。
 * 押した直後の未保存の値で数えると、保存に失敗したときに「完了」と
 * 出てしまう。数え方は src/lib/attendance.ts の progressLabel と同じ。
 */
export function AttendanceSheet({
  lessonId,
  students,
  initial,
  disabled,
  record,
}: {
  lessonId: string;
  students: { id: string; name: string; kana: string | null }[];
  initial: Record<string, AttendanceStatus>;
  disabled: boolean;
  record: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus,
  ) => Promise<AttendanceResult>;
}) {
  const [confirmed, setConfirmed] = useState(initial);

  const total = students.length;
  const recorded = students.filter(
    (s) => (confirmed[s.id] ?? "unconfirmed") !== "unconfirmed",
  ).length;
  const remaining = total - recorded;
  const done = total > 0 && remaining === 0;

  return (
    <div>
      <p
        className={`sf-num mb-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
          done
            ? "bg-sf-ok/12 text-sf-ok"
            : recorded > 0
              ? "bg-sf-warn/14 text-sf-warn"
              : "bg-sf-ink/6 text-sf-body"
        }`}
        role="status"
      >
        {done
          ? `完了 ${recorded} / ${total}`
          : `記録済 ${recorded} / ${total}・残り ${remaining}`}
      </p>
      <Roster
        lessonId={lessonId}
        students={students}
        initial={initial}
        disabled={disabled}
        record={record}
        onChange={setConfirmed}
      />
    </div>
  );
}
