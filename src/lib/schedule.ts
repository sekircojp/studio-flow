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
