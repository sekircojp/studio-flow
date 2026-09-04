/**
 * 開発用ログインが使える状態かどうか
 * ────────────────────────────────────────────────
 * ★ 二重に閉じている。
 *   1. NODE_ENV が production のときは絶対に有効にならない。
 *      Vercel のビルドは常に production なので、環境変数が誤って本番に
 *      入っても動かない。
 *   2. そのうえで DEV_LOGIN=1 が必要。既定では手元でも無効。
 *
 * ★ 本番で有効にしないこと。アドレスを知っているだけで、誰でもその人と
 *   してログインできる。公開 URL で有効にすると認証が無いのと同じになる。
 */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "1";
}
