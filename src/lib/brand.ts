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

/** ロゴが無いときに出すイニシャル（設計書 12章） */
export function brandInitial(studioName: string): string {
  const trimmed = studioName.trim();
  return trimmed ? [...trimmed][0] : "S";
}
