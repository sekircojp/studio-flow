"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, Clock3, Loader2, Minus, RotateCcw, X } from "lucide-react";

/**
 * 出欠の名簿（設計書 9章「講師のスマートフォン優先」）
 *
 * 片手で押せるよう、生徒1人につき大きなボタンを4つ横に並べる。
 * 選択はすぐ画面に反映し、保存はその裏で走らせる。現場で「押したのに
 * 変わらない」と何度も押されるのを防ぐため。
 *
 * ただし「保存できたか」は必ず見せる（2026-10-13）。
 *   保存中 … 小さな回転印
 *   保存済 … 何も出さない（普通の状態）
 *   失敗   … 直前に保存できていた値に戻し、赤い帯と「もう一度」を出す
 * 画面だけ変わって DB に入っていない状態を、押した人が気づけないのが
 * いちばん困る（翌月の振替権の有無に効いてくる）。
 *
 * 同じ生徒を素早く押し直したときは、最後に押したものだけを採用する。
 * 押すたびに番号を進め、返ってきた結果の番号が最新でなければ捨てる。
 * 古い保存の結果で新しい選択を上書きしない。
 *
 * 記録する処理はサーバーアクションを props で受け取る。管理画面（/admin）と
 * 講師の画面（/staff）で認可の入口が違うため、部品側では決めない。
 */

export type AttendanceStatus = "present" | "absent" | "late" | "unconfirmed";

/** 記録処理の返り値。失敗は理由付きで返し、例外にしない */
export type AttendanceResult = { ok: true } | { ok: false; error: string };

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

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string; wanted: AttendanceStatus };

export function Roster({
  lessonId,
  students,
  initial,
  disabled,
  record,
  onChange,
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
  /** 保存できた値の一覧が変わったときに親へ知らせる（進み具合の表示用） */
  onChange?: (marks: Record<string, AttendanceStatus>) => void;
}) {
  // 画面に出している値（押した直後に変わる）
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(initial);
  // DB に入っていると分かっている値。失敗したときはここへ戻す
  const confirmed = useRef<Record<string, AttendanceStatus>>({ ...initial });
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  // 生徒ごとの通し番号。最後に押した保存の結果だけを採用する
  const seq = useRef<Record<string, number>>({});

  async function mark(studentId: string, status: AttendanceStatus) {
    const my = (seq.current[studentId] ?? 0) + 1;
    seq.current[studentId] = my;

    // 先に画面を変えてから保存する
    setMarks((m) => ({ ...m, [studentId]: status }));
    setSaves((s) => ({ ...s, [studentId]: { kind: "saving" } }));

    let result: AttendanceResult;
    try {
      result = await record(lessonId, studentId, status);
    } catch {
      result = { ok: false, error: "通信できませんでした。" };
    }

    // そのあとに同じ生徒を押し直していたら、この結果は古いので捨てる
    if (seq.current[studentId] !== my) return;

    if (result.ok) {
      confirmed.current[studentId] = status;
      setSaves((s) => ({ ...s, [studentId]: { kind: "idle" } }));
      onChange?.({ ...confirmed.current });
    } else {
      const back = confirmed.current[studentId] ?? "unconfirmed";
      setMarks((m) => ({ ...m, [studentId]: back }));
      setSaves((s) => ({
        ...s,
        [studentId]: { kind: "error", message: result.error, wanted: status },
      }));
    }
  }

  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {students.map((s) => {
        const current = marks[s.id] ?? "unconfirmed";
        const save = saves[s.id] ?? { kind: "idle" };
        return (
          <li key={s.id} className="px-3 py-3 sm:px-4">
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] font-medium text-sf-ink">{s.name}</span>
              {s.kana && (
                <span className="text-[12px] text-sf-muted">{s.kana}</span>
              )}
              {save.kind === "saving" && (
                <span
                  className="ml-auto flex items-center gap-1 text-[12px] text-sf-muted"
                  role="status"
                >
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  保存中
                </span>
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
                    onClick={() => void mark(s.id, o.value)}
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
            {save.kind === "error" && (
              <div
                role="alert"
                className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-sf-danger/10 px-3 py-2 text-[12px] text-sf-ink"
              >
                <AlertCircle className="size-3.5 shrink-0 text-sf-danger" aria-hidden />
                <span className="min-w-0 flex-1">
                  保存できませんでした。{save.message}
                </span>
                <button
                  type="button"
                  onClick={() => void mark(s.id, save.wanted)}
                  className="inline-flex items-center gap-1 rounded-md border border-sf-danger/60 bg-white px-2 py-1 text-[12px] font-medium text-sf-danger transition hover:bg-sf-danger/10"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  もう一度
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
