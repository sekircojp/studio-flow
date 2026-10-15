"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, Clock3, Loader2, RotateCcw, X } from "lucide-react";

/**
 * 出欠の名簿（設計書 9章「講師のスマートフォン優先」）
 *
 * 名簿には在籍の生徒のほか、振替で来る生徒と体験の生徒も載る（2026-10-16）。
 * 行の鍵は在籍・振替なら生徒の id、体験なら申込の id。記録の置き場が違う
 * ので、どの種類の行かを kind で伝える。体験は「出席／欠席」の2択
 * （入会前なので遅刻までは記録しない）。
 *
 * 既定は「出席」（2026-10-14）
 *   たいてい全員来るので、来なかった人だけ直す方が速い。まだ押していない
 *   生徒は「出席」が薄く選ばれた見た目で並ぶ。欠席連絡が来ている生徒は
 *   「欠席」が薄く選ばれている。押した時点で保存され、濃い色になる。
 *   薄いままの生徒は、親の「この回の出欠を確定する」でまとめて保存される
 *   （何も押していない状態と「全員出席だった」を区別するため）。
 *
 * 「保存できたか」は必ず見せる
 *   保存中 … 小さな回転印
 *   失敗   … 直前に保存できていた値に戻し、赤い帯と「もう一度」を出す
 *
 * 同じ生徒を素早く押し直したときは、最後に押したものだけを採用する。
 *
 * 記録する処理はサーバーアクションを props で受け取る。管理画面（/admin）と
 * 講師の画面（/staff）で認可の入口が違うため、部品側では決めない。
 */

export type AttendanceStatus = "present" | "absent" | "late" | "unconfirmed";
export type RosterKind = "enrolled" | "transfer" | "trial";

export type RosterRow = {
  id: string;
  kind: RosterKind;
  name: string;
  kana: string | null;
};

/** 記録処理の返り値。失敗は理由付きで返し、例外にしない */
export type AttendanceResult = { ok: true } | { ok: false; error: string };

export type RecordFn = (
  lessonId: string,
  rowId: string,
  status: AttendanceStatus,
  kind: RosterKind,
) => Promise<AttendanceResult>;

const OPTIONS: {
  value: Exclude<AttendanceStatus, "unconfirmed">;
  label: string;
  icon: typeof Check;
  on: string;
  soft: string;
}[] = [
  {
    value: "present",
    label: "出席",
    icon: Check,
    on: "border-sf-ok bg-sf-ok text-white",
    soft: "border-sf-ok/50 bg-sf-ok/10 text-sf-ok",
  },
  {
    value: "late",
    label: "遅刻",
    icon: Clock3,
    on: "border-sf-warn bg-sf-warn text-white",
    soft: "border-sf-warn/50 bg-sf-warn/10 text-sf-warn",
  },
  {
    value: "absent",
    label: "欠席",
    icon: X,
    on: "border-sf-danger bg-sf-danger text-white",
    soft: "border-sf-danger/50 bg-sf-danger/10 text-sf-danger",
  },
];

const KIND_LABEL: Record<RosterKind, string | null> = {
  enrolled: null,
  transfer: "振替",
  trial: "体験",
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string; wanted: AttendanceStatus };

export function Roster({
  lessonId,
  rows,
  marks,
  notified,
  disabled,
  record,
  onSaved,
}: {
  lessonId: string;
  rows: RosterRow[];
  /** DB に入っている値。親が持ち、確定でまとめて変わる */
  marks: Record<string, AttendanceStatus>;
  /** 欠席連絡が来ている生徒。未記録なら「欠席」を既定にする */
  notified: Set<string>;
  disabled: boolean;
  record: RecordFn;
  /** 1人分が保存できたときに親へ知らせる */
  onSaved: (rowId: string, status: AttendanceStatus) => void;
}) {
  // 押した直後の値（保存が終わるまで、または失敗で戻るまで）
  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  // 行ごとの通し番号。最後に押した保存の結果だけを採用する
  const seq = useRef<Record<string, number>>({});

  async function mark(row: RosterRow, status: AttendanceStatus) {
    const my = (seq.current[row.id] ?? 0) + 1;
    seq.current[row.id] = my;

    setPending((p) => ({ ...p, [row.id]: status }));
    setSaves((s) => ({ ...s, [row.id]: { kind: "saving" } }));

    let result: AttendanceResult;
    try {
      result = await record(lessonId, row.id, status, row.kind);
    } catch {
      result = { ok: false, error: "通信できませんでした。" };
    }

    // そのあとに同じ行を押し直していたら、この結果は古いので捨てる
    if (seq.current[row.id] !== my) return;

    setPending((p) => {
      const next = { ...p };
      delete next[row.id];
      return next;
    });
    if (result.ok) {
      onSaved(row.id, status);
      setSaves((s) => ({ ...s, [row.id]: { kind: "idle" } }));
    } else {
      setSaves((s) => ({
        ...s,
        [row.id]: { kind: "error", message: result.error, wanted: status },
      }));
    }
  }

  return (
    <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
      {rows.map((r) => {
        const saved = marks[r.id] ?? "unconfirmed";
        const shown = pending[r.id] ?? saved;
        const recorded = shown !== "unconfirmed";
        // 未記録のときの既定の見た目。欠席連絡があれば欠席、無ければ出席
        const defaulted: AttendanceStatus = notified.has(r.id) ? "absent" : "present";
        const effective = recorded ? shown : defaulted;
        const save = saves[r.id] ?? { kind: "idle" };
        // 体験は遅刻を記録しない
        const options = r.kind === "trial" ? OPTIONS.filter((o) => o.value !== "late") : OPTIONS;
        const kindLabel = KIND_LABEL[r.kind];

        return (
          <li key={`${r.kind}-${r.id}`} className="px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[15px] font-semibold text-sf-ink">{r.name}</span>
              {r.kana && <span className="text-[12px] text-sf-muted">{r.kana}</span>}
              {kindLabel && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[12px] font-medium ${
                    r.kind === "trial"
                      ? "bg-sf-warn/14 text-sf-warn"
                      : "bg-sf-accent/12 text-sf-accent"
                  }`}
                >
                  {kindLabel}
                </span>
              )}
              {notified.has(r.id) && (
                <span className="rounded-md bg-sf-danger/10 px-1.5 py-0.5 text-[12px] font-medium text-sf-danger">
                  欠席連絡あり
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 text-[12px]">
                {save.kind === "saving" ? (
                  <span className="flex items-center gap-1 text-sf-muted" role="status">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    保存中
                  </span>
                ) : recorded ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void mark(r, "unconfirmed")}
                    className="text-sf-muted underline-offset-2 hover:text-sf-ink hover:underline disabled:opacity-40"
                  >
                    記録を消す
                  </button>
                ) : (
                  <span className="text-sf-muted">未確定</span>
                )}
              </span>
            </div>
            <div className={`mt-2 grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {options.map((o) => {
                const active = effective === o.value;
                const cls = active
                  ? recorded
                    ? o.on
                    : o.soft
                  : "border-sf-border-strong bg-white text-sf-body hover:border-sf-muted";
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => void mark(r, o.value)}
                    aria-pressed={active && recorded}
                    title={active && !recorded ? "まだ保存されていません（押すか、確定で保存）" : undefined}
                    className={`flex items-center justify-center gap-1 rounded-lg border py-2.5 text-[13px] font-medium transition disabled:opacity-40 ${cls}`}
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
                <span className="min-w-0 flex-1">保存できませんでした。{save.message}</span>
                <button
                  type="button"
                  onClick={() => void mark(r, save.wanted)}
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
