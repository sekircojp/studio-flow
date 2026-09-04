// supabase/functions/send-verification-code/index.ts
//
// ログイン（およびスタジオ経由の登録）の前に、メールアドレスの確認コードを送る。
// 移植元: MarcheBase supabase/functions/send-verification-code
//
// 重要な方針（移植元から引き継ぐ）
//  ・登録済みかどうかをレスポンスで漏らさない。未登録でも同じ 200 を返す。
//    返すと、アドレスを入れ替えるだけで「誰がこのスタジオに在籍しているか」を
//    外部から調べられてしまう。
//  ・コードそのものは DB に保存せず、ハッシュだけ保存する。
//  ・同一アドレスへの連投を制限する（60秒に1通、1時間に5通まで）。
//
// Studio Flow での変更点
//  ・organizer_id → organization_id、organizers.name → brand_settings.studio_name
//  ・送信結果を握り潰さないよう、_shared/resend-send.ts の sendMail を通す

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { corsHeaders } from "../_shared/cors.ts";
import { mailFrom } from "../_shared/mail-from.ts";
import { sendMail } from "../_shared/resend-send.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // RLS を迂回する。絶対にクライアントへ出さない
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_PER_HOUR = 5;

let cors: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// 6桁。先頭が0でも桁が落ちないよう文字列で扱う
function makeCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
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
    const { email, organization_id } = await req.json();

    const addr = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      return json({ error: "invalid_email" }, 400);
    }

    // --- 連投チェック ---
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await supabase
      .from("email_verifications")
      .select("created_at")
      .eq("email", addr)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });

    if (recent && recent.length > 0) {
      const last = new Date(recent[0].created_at).getTime();
      if (Date.now() - last < RESEND_COOLDOWN_SECONDS * 1000) {
        return json({ ok: true, throttled: true }); // 成否は伝えるが理由は曖昧に
      }
      if (recent.length >= MAX_PER_HOUR) {
        return json({ ok: true, throttled: true });
      }
    }

    // --- コード発行 ---
    const code = makeCode();
    const codeHash = await sha256(`${addr}:${code}`);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    // 同じアドレスの未使用コードは無効化しておく（古いコードで通れないように）
    await supabase
      .from("email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", addr)
      .is("consumed_at", null);

    const { error: insertError } = await supabase.from("email_verifications").insert({
      email: addr,
      organization_id: organization_id ?? null,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    // --- スタジオ名を差出人の表示名に使う（設計書 11章） ---
    // ログイン画面から呼ばれた場合は organization_id が無い。
    // そのときは mailFrom() が MAIL_FROM の表示名をそのまま使う。
    // サービス名をここに書かないのは、名称変更のたびに関数を
    // デプロイし直すことになるため。シークレット1つで変えられるようにする。
    let studioName = "";
    let replyTo: string | undefined;
    if (organization_id) {
      const { data: brand } = await supabase
        .from("brand_settings")
        .select("studio_name, email")
        .eq("organization_id", organization_id)
        .maybeSingle();
      studioName = brand?.studio_name ?? "";
      replyTo = brand?.email ?? undefined;
    }

    const subject = studioName
      ? `【${studioName}】確認コード ${code}`
      : `確認コード ${code}`;

    const result = await sendMail(resend, {
      from: mailFrom(studioName),
      // 返信はスタジオに届くようにする（設計書 11章）
      ...(replyTo ? { reply_to: replyTo } : {}),
      to: addr,
      subject,
      text: [
        `確認コード： ${code}`,
        ``,
        `ログイン画面にこの6桁の数字をご入力ください。`,
        `このコードは${CODE_TTL_MINUTES}分間有効です。`,
        ``,
        `お心当たりのない場合は、このメールを破棄してください。`,
        studioName ? `\n${studioName}` : ``,
      ].join("\n"),
    });

    if (!result.ok) {
      // 送れていないのに ok を返すと、利用者はコードを待ち続けることになる
      console.error("resend failed", result.error);
      return json({ error: "send_failed" }, 500);
    }

    // 登録済みかどうかはここでは返さない
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    // 失敗の詳細もクライアントには返さない
    return json({ error: "send_failed" }, 500);
  }
});
