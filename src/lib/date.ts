/**
 * 日時の表示（設計書 2.1）
 * ────────────────────────────────────────────────
 * DB は timestamptz で UTC 保存。表示は Asia/Tokyo 固定。
 * サーバーが動く場所（Vercel）のタイムゾーンに引きずられないよう、
 * 表示に使う変換は必ずここを通す。
 */

export const TIME_ZONE = "Asia/Tokyo";

/** 2026年9月1日（月） */
export function formatDateJa(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/** 9/1（月） */
export function formatShortDateJa(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/** 16:00 */
export function formatTimeJa(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * JST での「時」。挨拶の出し分けに使う。
 * サーバー側で評価すると UTC の時刻になってしまうため、必ずここを通す。
 */
export function hourInTokyo(value: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(value),
  );
}

/**
 * JST での「今日」を YYYY-MM-DD で返す。
 * date 型の列と突き合わせるときに使う。サーバーの UTC で日付を取ると、
 * 日本の朝9時より前と、夜9時以降で1日ずれる。
 */
export function todayInTokyo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function greetingJa(now: Date = new Date()): string {
  const h = hourInTokyo(now);
  if (h < 4) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

/** 金額。税込・整数（円）で保持しているので小数は扱わない（設計書 2.2） */
export function formatYen(amount: number): string {
  return "¥" + amount.toLocaleString("ja-JP");
}
