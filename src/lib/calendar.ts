/**
 * 月カレンダーの組み立て
 * ────────────────────────────────────────────────
 * 日付は "YYYY-MM-DD" の文字列だけで扱う。Date オブジェクトを経由すると、
 * 実行環境のタイムゾーンで1日ずれる。lessons.date も studio_closures.date も
 * date 型（時刻を持たない）なので、文字列のまま突き合わせるのが安全。
 *
 * 計算に Date を使う場面では必ず UTC 系のメソッド（getUTCDay など）を使う。
 *
 * ★ "use client" のファイルに置かないこと。
 *   Server Component から読むと実体ではなくクライアント参照になる。
 */

export type CalendarDay = {
  /** YYYY-MM-DD */
  date: string;
  /** その月の日か（前後の月からはみ出したマスは false） */
  inMonth: boolean;
  /** 1〜31 */
  day: number;
  /** 0 = 日曜 … 6 = 土曜 */
  dayOfWeek: number;
};

/** YYYY-MM-DD を UTC の Date にする。時刻は持ち込まない */
function toUtc(date: string): Date {
  return new Date(date + "T00:00:00Z");
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** その月の1日 */
export function monthStartOf(date: string): string {
  return date.slice(0, 7) + "-01";
}

/** その月の末日 */
export function monthEndOf(date: string): string {
  const d = toUtc(monthStartOf(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toIso(d);
}

/**
 * 日曜始まりの週の配列を返す。
 * 前後の月の日でマスを埋めるので、常に 7 の倍数になる。
 */
export function monthWeeks(month: string): CalendarDay[][] {
  const first = monthStartOf(month);
  const last = monthEndOf(month);
  const firstDow = toUtc(first).getUTCDay();

  // 週の頭（日曜）まで戻る
  let cursor = addDays(first, -firstDow);

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  // 末日を含む週の土曜まで進める
  const lastDow = toUtc(last).getUTCDay();
  const end = addDays(last, 6 - lastDow);

  while (cursor <= end) {
    const d = toUtc(cursor);
    week.push({
      date: cursor,
      inMonth: cursor >= first && cursor <= last,
      day: d.getUTCDate(),
      dayOfWeek: d.getUTCDay(),
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor = addDays(cursor, 1);
  }

  return weeks;
}

/** 2026-09 → 2026年9月 */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y)}年${Number(m)}月`;
}

/** 月を前後に動かす。YYYY-MM-01 を返す */
export function shiftMonthDate(month: string, delta: number): string {
  const d = toUtc(monthStartOf(month));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return toIso(d);
}
