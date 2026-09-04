/**
 * 曜日の表示
 * ────────────────────────────────────────────────
 * classes.day_of_week は 0 = 日曜 … 6 = 土曜。
 * PostgreSQL の extract(dow) と同じ並びなので、DB 側の生成処理と
 * 突き合わせるときも変換が要らない。
 *
 * ★ この定数を "use client" のファイルに置かないこと。
 *   Server Component から読むと実体ではなくクライアント参照になり、
 *   値が undefined になる（曜日が表示されない不具合になった）。
 */
export const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? "?";
}

/** 16:00:00 → 16:00 */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * 開催枠（class_meetings）の表示
 * ────────────────────────────────────────────────
 * クラスは週に何回開いてもよい（設計書 4.2）。
 * 「初級クラス（週2回）」は1クラスで、開催枠を2件持つ。
 */
export type Meeting = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/** 毎週火 16:00–17:00 */
export function meetingLabel(m: Meeting): string {
  return `毎週${dayLabel(m.day_of_week)} ${hhmm(m.start_time)}–${hhmm(m.end_time)}`;
}

/** 火 16:00 / 土 10:00 のように短くまとめる。一覧の副題向け */
export function meetingsShortLabel(meetings: Meeting[]): string {
  if (meetings.length === 0) return "開催枠なし";
  return meetings
    .map((m) => `${dayLabel(m.day_of_week)} ${hhmm(m.start_time)}`)
    .join(" / ");
}

/** 週N回。1回のときは回数を出さない */
export function weeklyCountLabel(meetings: Meeting[]): string {
  return meetings.length > 1 ? `週${meetings.length}回` : "";
}
