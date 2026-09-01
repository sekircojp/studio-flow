/**
 * ブラウザから呼ばれる Edge Function 用の CORS 設定
 * ────────────────────────────────────────────────
 * 移植元: MarcheBase supabase/functions/_shared/cors.ts
 *
 * なぜ共通化するか
 *   ALLOWED_ORIGIN を "*" のままにすると、どこのサイトからでも
 *   確認コードの送信を叩ける。迷惑メールの踏み台にされうる。
 *
 *   一方で、許可したい相手は1つではない。
 *     ・開発中の localhost
 *     ・本番のドメイン
 *     ・(将来) Vercel のプレビュー環境
 *
 *   Access-Control-Allow-Origin ヘッダには値を1つしか書けないため、
 *   「複数を設定しておき、来た相手がその中にいれば、その相手を返す」
 *   という形にする。カンマ区切りをそのまま返しても効かない。
 *
 * 設定方法
 *   ALLOWED_ORIGIN にカンマ区切りで並べる。
 *   例) http://localhost:3000,https://app.sekir.co.jp
 *   "*" を入れた場合は全許可（開発の逃げ道として残す）。
 */

function allowedList(): string[] {
  return (Deno.env.get("ALLOWED_ORIGIN") ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 呼び出し元に応じた CORS ヘッダを返す */
export function corsHeaders(req: Request): Record<string, string> {
  const list = allowedList();
  const origin = req.headers.get("Origin") ?? "";

  // 全許可の設定なら従来どおり
  if (list.includes("*")) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
  }

  // 許可した相手なら、その相手を返す。
  // 許可していない相手には最初の1つを返す（ブラウザ側で弾かれる）
  const allow = list.includes(origin) ? origin : list[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    // 相手によって返す値が変わるので、途中の中継に覚えさせない
    Vary: "Origin",
  };
}

/** メール本文のリンクなどに使う URL。CORS の設定とは別物 */
export function siteUrl(): string {
  return (Deno.env.get("PUBLIC_SITE_URL") ?? "").replace(/\/$/, "");
}
