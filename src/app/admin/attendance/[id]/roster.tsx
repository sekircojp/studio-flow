"use client";

import { useState, useTransition } from "react";
import { Check, Clock3, Minus, X } from "lucide-react";
import { recordAttendance, type AttendanceStatus } from "../actions";

/**
 * 出欠の名簿（設計書 9章「講師のスマートフォン優先」）
 *
 * 片手で押せるよう、生徒1人につき大きなボタンを4つ横に並べる。
 * 選択はすぐ画面に反映し、保存はその裏で走らせる。現場で「押したのに
 * 変わらない」と何度も押されるのを防ぐため。
 */

const OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: typeof Check;
  on: string;
}[] = [
  { value: "present", label: "出席", icon: Check, on: "bg-sf-ok text-white border-sf-ok" },
  { value: "late", label: "遅刻", icon: Clock3, on: "bg-sf-warn text-white border-sf-warn" },
  { value: "absent", label: "欠席", icon: X, on: "bg-sf-danger text-white border-sf-danger" },
  { value: "unconfirmed", label: "未", icon: Minus, on: "bg-sf-ink text-white border-sf-ink" },
];

export function Roster({
  lessonId,
  students,
  initial,
  disabled,
}: {
  lessonId: string;
  students: { id: string; name: string; kana: string | null }[];
  initial: Record<string, AttendanceStatus>;
  disabled: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(initial);
  const [, startTransition] = useTransition();

  function mark(studentId: string, status: AttendanceStatus) {
    // 先に画面を変えてから保存する
    setMarks((m) => ({ ...m, [studentId]: status }));
    startTransition(() => {
      void recordAttendance(lessonId, studentId, status);
    });
  }

  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {students.map((s) => {
        const current = marks[s.id] ?? "unconfirmed";
        return (
          <li key={s.id} className="px-3 py-3 sm:px-4">
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] font-medium text-sf-ink">{s.name}</span>
              {s.kana && (
                <span className="text-[11px] text-sf-muted">{s.kana}</span>
              )}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {OPTIONS.map((o) => {
                const active = current === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => mark(s.id, o.value)}
                    aria-pressed={active}
                    className={`flex items-center justify-center gap-1 rounded-lg border py-2.5 text-[13px] font-medium transition disabled:opacity-40 ${
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
          </li>
        );
      })}
    </ul>
  );
}
