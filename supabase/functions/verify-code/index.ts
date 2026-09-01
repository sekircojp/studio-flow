// supabase/functions/verify-code/index.ts
//
// 確認コードを照合し、通ったらそのアドレスのユーザーとして
// ログイン済みの状態にするためのトークンを返す。
// 移植元: MarcheBase supabase/functions/verify-code
//
// 重要な方針（移植元から引き継ぐ）
//  ・6桁は総当たりで100万通りしかないので、試行回数の制限が必須。
//    5回間違えたらそのコードを無効にする。
//  ・照合は必ずサーバー側。クライアントにコードを渡さない。
//
// Studio Flow での変更点
//  ① ユーザーを新規作成しない。
//     MarcheBase は出店者のゲスト申込があるため、照合が通った時点で
//     auth.users を作っていた。Studio Flow のフェーズ1には WEB 入会が無く
//     （設計書 9.1）、利用者はスタジオ側が登録する。見ず知らずのアドレスで
//     ログインできてしまうと、空のアカウントが際限なく増える。
//
//  ② 既存ユーザーの検索を全件走査から索引引きに変えた。
//     移植元は listUsers({ perPage: 1000 }) で全件を取得して探していたため、
//     利用者が増えると破綻する。app.find_user_id_by_email を使う。
//
//  ③ 未登録のアドレスには、その旨をはっきり返す。
//     コードが届いた＝そのメールボックスの持ち主であることは確認済みなので、
//     第三者への漏洩にはならない。黙って失敗させるより問い合わせが減る。
//     （コード送信の時点では、まだ本人確認前なので何も明かさない）

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_ATTEMPTS = 5;

let cors: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // 呼び出し元ごとに許可を判定する
  cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, code } = await req.json();
    const addr = String(email ?? "").trim().toLowerCase();
    const input = String(code ?? "").trim();

    if (!addr || !/^\d{6}$/.test(input)) {
      return json({ valid: false, reason: "invalid_input" }, 400);
    }

    // --- 最新の未使用コードを取り出す ---
    const { data: rec } = await supabase
      .from("email_verifications")
      .select("id, code_hash, expires_at, attempts")
      .eq("email", addr)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rec) return json({ valid: false, reason: "no_code" });

    if (new Date(rec.expires_at) < new Date()) {
      return json({ valid: false, reason: "expired" });
    }

    if (rec.attempts >= MAX_ATTEMPTS) {
      // 上限に達したコードは使えなくする
      await supabase
        .from("email_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", rec.id);
      return json({ valid: false, reason: "too_many_attempts" });
    }

    const inputHash = await sha256(`${addr}:${input}`);
    if (inputHash !== rec.code_hash) {
      await supabase
        .from("email_verifications")
        .update({ attempts: rec.attempts + 1 })
        .eq("id", rec.id);
      return json({
        valid: false,
        reason: "mismatch",
        attempts_left: MAX_ATTEMPTS - (rec.attempts + 1),
      });
    }

    // --- 照合成功。コードを使用済みにする ---
    await supabase
      .from("email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", rec.id);

    // --- 登録済みのユーザーか（索引引き。作成はしない） ---
    const { data: userId, error: findError } = await supabase.rpc("find_user_id_by_email", {
      target_email: addr,
    });
    if (findError) throw findError;

    if (!userId) {
      // 本人確認は済んでいるので、状況をはっきり伝える
      return json({ valid: true, registered: false });
    }

    // --- クライアントをログイン状態にするためのトークンを発行 ---
    // magic link のハッシュ済みトークンを返し、フロントで verifyOtp して
    // セッションを確立する。メールのリンクは踏ませない。
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: addr,
    });
    if (linkError) throw linkError;

    return json({
      valid: true,
      registered: true,
      email: addr,
      // フロントは supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) を呼ぶ
      token_hash: link.properties?.hashed_token,
    });
  } catch (e) {
    console.error(e);
    return json({ valid: false, reason: "server_error" }, 500);
  }
});
