// supabase/functions/send-invoice-notice/index.ts
//
// 請求のお知らせを保護者へ送る（設計書 5.4 / 11章）。
//
// 入力: { organization_id, billing_month }  billing_month は "YYYY-MM-01"
// 出力: { sent, skipped, failed }
//
// 呼び出し元は2つ。
//   ・画面の「お知らせを送る」ボタン（管理者が任意のタイミングで押す）
//   ・pg_cron（請求を作った直後に自動で送る）
//
// 方針
//  ・宛先は世帯の請求先保護者。未登録・メール未入力の生徒は skipped に残す。
//    黙って飛ばすと「あの家だけ届いていない」の原因が分からなくなる。
//  ・送信結果は必ず deliveries に1行ずつ残す（成否と理由）。
//  ・同じ請求へ二度送らない。DB 側にも部分一意索引があるので、
//    競合しても二重送信にはならない。
//  ・From の表示名はスクール名、Reply-To はスタジオのメールアドレス（設計書 11章）。
//  ・金額の計算はしない。invoices に保存された値をそのまま載せる（設計書 2.2）。

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

let cors: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** 2026-09-01 → 2026年9月 */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y)}年${Number(m)}月`;
}

/** 2026-09-27 → 9月27日 */
function dayLabel(date: string | null): string {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

Deno.serve(async (req) => {
  cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { organization_id, billing_month } = await req.json();
    if (!organization_id || !billing_month) {
      return json({ error: "organization_id と billing_month が要ります" }, 400);
    }

    // スクール名と返信先（設計書 11章）
    const { data: brand } = await supabase
      .from("brand_settings")
      .select("studio_name, email")
      .eq("organization_id", organization_id)
      .maybeSingle();

    const studioName = brand?.studio_name ?? "";
    const replyTo = brand?.email ?? undefined;

    // 対象は下書き以外の請求。取消したものは送らない
    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, total, due_date, billing_month, student_id, students(name, household_id)",
      )
      .eq("organization_id", organization_id)
      .eq("billing_month", billing_month)
      .not("status", "in", "(draft,canceled)");

    if (invoiceError) {
      console.error("請求の取得に失敗しました", invoiceError);
      return json({ error: "server_error" }, 500);
    }
    if (!invoices || invoices.length === 0) {
      return json({ sent: 0, skipped: 0, failed: 0, reason: "no_invoices" });
    }

    // 既に送れているものは対象から外す
    const { data: already } = await supabase
      .from("deliveries")
      .select("invoice_id")
      .eq("organization_id", organization_id)
      .eq("channel", "email")
      .eq("status", "sent")
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      );
    const sentIds = new Set((already ?? []).map((d) => d.invoice_id));

    const label = monthLabel(billing_month);
    const subject = `${label}分の月謝のお知らせ`;

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({
        organization_id,
        kind: "invoice_issued",
        target_month: billing_month,
        subject,
      })
      .select("id")
      .single();

    if (notificationError || !notification) {
      console.error("通知の作成に失敗しました", notificationError);
      return json({ error: "server_error" }, 500);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const invoice of invoices) {
      const student = invoice.students as unknown as {
        name: string;
        household_id: string;
      } | null;

      if (sentIds.has(invoice.id)) {
        skipped += 1;
        continue;
      }

      // 宛先は世帯の請求先保護者
      const { data: guardian } = await supabase
        .from("guardians")
        .select("id, name, email")
        .eq("organization_id", organization_id)
        .eq("household_id", student?.household_id ?? "")
        .eq("is_billing_contact", true)
        .maybeSingle();

      // 送れない理由も1行として残す。黙って飛ばすと原因が追えない
      if (!guardian?.email) {
        await supabase.from("deliveries").insert({
          organization_id,
          notification_id: notification.id,
          guardian_id: guardian?.id ?? null,
          invoice_id: invoice.id,
          channel: "email",
          status: "skipped",
          error: guardian
            ? "請求先の保護者にメールアドレスが登録されていません"
            : "請求先の保護者が登録されていません",
        });
        skipped += 1;
        continue;
      }

      const due = dayLabel(invoice.due_date);
      const lines = [
        `${guardian.name} 様`,
        "",
        `${label}分の月謝のお知らせです。`,
        "",
        `　お子さま　${student?.name ?? ""}`,
        `　ご請求額　${yen(invoice.total)}（税込）`,
        due ? `　お支払期限　${due}` : "",
        "",
        "内訳はマイページからご確認いただけます。",
        "",
        studioName,
      ].filter((l) => l !== "");

      const text = lines.join("\n");
      const html = lines
        .map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`)
        .join("");

      const result = await sendMail(resend, {
        from: mailFrom(studioName),
        to: guardian.email,
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      await supabase.from("deliveries").insert({
        organization_id,
        notification_id: notification.id,
        guardian_id: guardian.id,
        invoice_id: invoice.id,
        channel: "email",
        to_address: guardian.email,
        status: result.ok ? "sent" : "failed",
        provider_id: result.id,
        error: result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      });

      if (result.ok) sent += 1;
      else failed += 1;
    }

    return json({ sent, skipped, failed });
  } catch (e) {
    console.error("請求のお知らせ送信で例外", e);
    return json({ error: "server_error" }, 500);
  }
});
