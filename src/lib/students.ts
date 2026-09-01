/**
 * 生徒の在籍状態（設計書 4.3）
 * ────────────────────────────────────────────────
 * 休会を2種類持つのが要点。休会費を設定した場合は請求が発生するため、
 * 「休会中（請求あり）」と「休会中（請求停止）」を区別しないと、
 * ダッシュボードの件数と請求件数が合わなくなる。
 *
 * ★ "use client" のファイルに置かないこと。
 *   Server Component から読むと実体ではなくクライアント参照になる。
 */

export const STUDENT_STATUSES = [
  { value: "trial", label: "体験", tone: "info" },
  { value: "active", label: "在籍", tone: "ok" },
  { value: "suspended_billed", label: "休会（請求あり）", tone: "warn" },
  { value: "suspended_unbilled", label: "休会（請求停止）", tone: "muted" },
  { value: "withdrawn", label: "退会", tone: "muted" },
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number]["value"];

export function statusLabel(status: string): string {
  return STUDENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function statusTone(status: string): string {
  return STUDENT_STATUSES.find((s) => s.value === status)?.tone ?? "muted";
}

/** 生年月日から満年齢。誕生日を過ぎているかで1歳変わるので日付で比べる */
export function ageFrom(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate + "T00:00:00Z");
  if (Number.isNaN(b.getTime())) return null;

  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}
