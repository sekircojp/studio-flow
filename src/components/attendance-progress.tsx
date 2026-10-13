import { Pill } from "@/components/ui";
import {
  progressLabel,
  progressState,
  type AttendanceProgress,
} from "@/lib/attendance";

/**
 * 出欠の入力の進み具合を示す札
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
  if (state === "empty") return <Pill tone="muted">対象なし</Pill>;
  if (state === "done") return <Pill tone="ok">{progressLabel(progress)}</Pill>;
  if (state === "none") {
    return (
      <Pill tone={ended ? "warn" : "neutral"}>
        未入力{ended ? "" : ` ${progress.total} 名`}
      </Pill>
    );
  }
  return <Pill tone={ended ? "warn" : "info"}>{progressLabel(progress)}</Pill>;
}
