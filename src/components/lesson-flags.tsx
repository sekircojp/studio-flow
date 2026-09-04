import { Repeat2, UserMinus } from "lucide-react";
import type { LessonFlags } from "@/lib/lessons";

/**
 * レッスンに付いた「いつもと違う点」のバッジ
 *
 * 欠席連絡は赤。人数が減るので、当日いちばん先に気付いてほしい。
 * 振替は控えめな色にする。増える側は現場での驚きが小さい。
 *
 * 何も無い日は何も出さない。毎日「0件」が並ぶと、色そのものが読み飛ばされる。
 */
export function LessonFlagBadges({
  flags,
  className = "",
}: {
  flags: LessonFlags | undefined;
  className?: string;
}) {
  if (!flags || (flags.absences === 0 && flags.transfersIn === 0)) return null;

  return (
    <span className={`flex shrink-0 flex-wrap items-center gap-1 ${className}`}>
      {flags.absences > 0 && (
        <span className="flex items-center gap-1 rounded-md bg-sf-danger/10 px-2 py-1 text-[11px] font-medium text-sf-danger">
          <UserMinus className="size-3" aria-hidden />
          欠席 {flags.absences}
        </span>
      )}
      {flags.transfersIn > 0 && (
        <span className="flex items-center gap-1 rounded-md bg-sf-accent/10 px-2 py-1 text-[11px] font-medium text-sf-accent">
          <Repeat2 className="size-3" aria-hidden />
          振替 {flags.transfersIn}
        </span>
      )}
    </span>
  );
}
