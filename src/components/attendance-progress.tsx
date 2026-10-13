import {
  progressLabel,
  progressState,
  type AttendanceProgress,
} from "@/lib/attendance";

/**
 * 出欠の入力の進み具合を示す小さな札
 *
 *   未入力（終わった回なら注意色） / 入力中 / 完了 / 対象なし
 * 色だけで伝えず、必ず文字を出す。数え方は lib/attendance に1つ。
 */
export function AttendanceProgressBadge({
  progress,
  ended,
}: {
  progress: AttendanceProgress;
  /** 終了時刻を過ぎているか。過ぎていれば未入力・入力中を注意色にする */
  ended: boolean;
}) {
  const state = progressState(progress);
  const base = "shrink-0 rounded-md px-2 py-1 text-[12px] font-medium";

  if (state === "empty") {
    return <span className={`${base} bg-sf-ink/6 text-sf-muted`}>対象なし</span>;
  }
  if (state === "done") {
    return (
      <span className={`${base} bg-sf-ok/12 text-sf-ok`}>
        {progressLabel(progress)}
      </span>
    );
  }
  if (state === "none") {
    return (
      <span
        className={`${base} ${ended ? "bg-sf-warn/14 text-sf-warn" : "bg-sf-ink/6 text-sf-body"}`}
      >
        未入力{ended ? "" : ` ${progress.total} 名`}
      </span>
    );
  }
  return (
    <span className={`${base} ${ended ? "bg-sf-warn/14 text-sf-warn" : "bg-sf-accent/12 text-sf-accent"}`}>
      {progressLabel(progress)}
    </span>
  );
}
