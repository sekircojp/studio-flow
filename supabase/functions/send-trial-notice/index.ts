// supabase/functions/send-trial-notice/index.ts
//
// 体験・見学の承認／見送りを、申し込んだ保護者へ連絡する（設計書 4.6.2 / 11章）。
//
// 入力: { trial_id }
// 出力: { status: "sent" | "failed" | "duplicate" | "not_target" }
//
// 呼び出し元は DB のトリガー（app.notify_trial_decision）。承認待ちから
// 確定・見送りへ変わったときだけ飛んでくる。
//
// 方針
//  ・宛先は申込フォームに入力されたアドレス。体験の時点では保護者として
//    登録されていないので guardians とは結びつかない。deliveries には
//    guardian_id を入れず、送信時点の宛先を to_address に残す。
//  ・確定の連絡には「いつ・どこで」を必ず入れる。日時だけ書いても、
//    初めて来る人はスタジオの場所を知らない。
//  ・見送りの連絡に理由は書かない。運営が理由をそのまま送りたい場面は
//    まずなく、書ける欄も持っていない。問い合わせ先だけを添える。
//  ・From の表示名はスクール名、Reply-To はスタジオのメールアドレス（設計書 11章）。

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

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026-09-15 → 9月15日(火) */
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const w = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日(${w})`;
}

/** timestamptz → JST の 16:00 */
function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return t;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type Lesson = {
  date: string;
  start_at: string | null;
  end_at: string | null;
  classes: { name: string } | null;
  rooms: {
    name: string;
    locations: { name: string; address: string | null; tel: string | null } | null;
  } | null;
};

Deno.serve(async (req) => {
  cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { trial_id } = await req.json();
    if (!trial_id) return json({ error: "trial_id が要ります" }, 400);

    const { data: trial, error: trialError } = await supabase
      .from("trials")
      .select(
        "id, organization_id, kind, status, student_name, guardian_name, email, " +
          "lessons(date, start_at, end_at, classes(name), rooms(name, locations(name, address, tel)))",
      )
      .eq("id", trial_id)
      .maybeSingle();

    if (trialError) {
      console.error("体験申込の取得に失敗しました", trialError);
      return json({ error: "server_error" }, 500);
    }
    if (!trial) return json({ error: "not_found" }, 404);

    // トリガー以外から叩かれたときの保険。確定・見送り以外は送らない
    if (trial.status !== "booked" && trial.status !== "declined") {
      return json({ status: "not_target" });
    }

    const approved = trial.status === "booked";
    const kindLabel = trial.kind === "observation" ? "見学" : "体験";
    const notificationKind = approved ? "trial_approved" : "trial_declined";

    // 同じ申込へ同じ内容を二度送らない。トリガー側でも防いでいるが、
    // 直接叩かれた場合にここで止める
    const { data: already } = await supabase
      .from("deliveries")
      .select("id, notifications(kind)")
      .eq("trial_id", trial.id)
      .eq("channel", "email")
      .eq("status", "sent");

    const duplicate = (already ?? []).some(
      (d) => (d.notifications as unknown as { kind: string } | null)?.kind === notificationKind,
    );
    if (duplicate) return json({ status: "duplicate" });

    // スクール名と返信先（設計書 11章）
    const { data: brand } = await supabase
      .from("brand_settings")
      .select("studio_name, email, tel")
      .eq("organization_id", trial.organization_id)
      .maybeSingle();

    const studioName = brand?.studio_name ?? "";
    const replyTo = brand?.email ?? undefined;

    const lesson = trial.lessons as unknown as Lesson | null;
    const location = lesson?.rooms?.locations ?? null;

    const when = lesson
      ? `${dateLabel(lesson.date)} ${timeLabel(lesson.start_at)}` +
        (lesson.end_at ? `〜${timeLabel(lesson.end_at)}` : "")
      : "";

    const subject = approved
      ? `${kindLabel}のご予約が確定しました`
      : `${kindLabel}のお申し込みについて`;

    const lines = approved
      ? [
          `${trial.guardian_name} 様`,
          "",
          `${kindLabel}のお申し込みをありがとうございました。下記のとおり確定しました。`,
          "",
          `　お子さま　${trial.student_name}`,
          lesson?.classes?.name ? `　クラス　　${lesson.classes.name}` : "",
          when ? `　日時　　　${when}` : "",
          location?.name
            ? `　場所　　　${location.name}${lesson?.rooms?.name ? ` ${lesson.rooms.name}` : ""}`
            : "",
          location?.address ? `　　　　　　${location.address}` : "",
          "",
          "当日は少し早めにお越しください。ご都合が悪くなった場合は、",
          "このメールへご返信いただくかお電話でお知らせください。",
          "",
          brand?.tel ? `お問い合わせ　${brand.tel}` : "",
          studioName,
        ]
      : [
          `${trial.guardian_name} 様`,
          "",
          `${kindLabel}のお申し込みをありがとうございました。`,
          "たいへん申し訳ございませんが、今回はご希望の回でお受けすることが",
          "できませんでした。",
          "",
          when ? `　お申し込みの回　${when}` : "",
          "",
          "別の回でしたらご案内できる場合がございます。ご検討いただける",
          "ようでしたら、このメールへご返信いただくかお電話でお知らせください。",
          "",
          brand?.tel ? `お問い合わせ　${brand.tel}` : "",
          studioName,
        ];

    const body = lines.filter((l) => l !== "");
    const text = body.join("\n");
    const html = body
      .map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`)
      .join("");

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({
        organization_id: trial.organization_id,
        kind: notificationKind,
        subject,
      })
      .select("id")
      .single();

    if (notificationError || !notification) {
      console.error("通知の作成に失敗しました", notificationError);
      return json({ error: "server_error" }, 500);
    }

    const result = await sendMail(resend, {
      from: mailFrom(studioName),
      to: trial.email,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    });

    await supabase.from("deliveries").insert({
      organization_id: trial.organization_id,
      notification_id: notification.id,
      trial_id: trial.id,
      channel: "email",
      to_address: trial.email,
      status: result.ok ? "sent" : "failed",
      provider_id: result.id,
      error: result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    return json({ status: result.ok ? "sent" : "failed" });
  } catch (e) {
    console.error("体験の連絡送信で例外", e);
    return json({ error: "server_error" }, 500);
  }
});
