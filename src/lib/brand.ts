/**
 * ブランド表示の型と、サーバー・クライアント双方で使う関数（設計書 12章）
 * ────────────────────────────────────────────────
 * ここには next/headers などサーバー専用の依存を持ち込まないこと。
 * サイドバーのようなクライアント側の部品からも読むため、ここが
 * サーバー専用モジュールを取り込むと、クライアントのビルドが壊れる。
 *
 * DB から読む処理は brand.server.ts に置く。
 */

export type Brand = {
  studioName: string;
  logoUrl: string | null;
  brandColor: string | null;
  tel: string | null;
  email: string | null;
  postalCode: string | null;
  address: string | null;
  website: string | null;
  invoiceRegistrationNumber: string | null;
  terms: string | null;
  termsUpdatedAt: string | null;
};

/** ロゴもスタジオ名も未登録のときに使う既定値 */
export const FALLBACK_STUDIO_NAME = "（スタジオ名未設定）";

/**
 * ブランドカラーの上に置く文字の色（設計書 12章）
 *
 * 明るい色（黄・水色など）を選んだスタジオでは、白い文字が読めなくなる。
 * 相対輝度で判定し、明るければ濃紺の文字にする。
 */
export function accentInkFor(hex: string | null): string {
  if (!hex) return "#ffffff";
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return luminance > 0.45 ? "#171c35" : "#ffffff";
}

/** レイアウトの根に当てる CSS 変数。ブランド色と、その上の文字色 */
export function brandStyle(brand: Brand): Record<string, string> | undefined {
  if (!brand.brandColor) return undefined;
  return {
    "--sf-accent": brand.brandColor,
    "--sf-accent-ink": accentInkFor(brand.brandColor),
  };
}

/** ロゴが無いときに出すイニシャル（設計書 12章） */
export function brandInitial(studioName: string): string {
  const trimmed = studioName.trim();
  return trimmed ? [...trimmed][0] : "S";
}
