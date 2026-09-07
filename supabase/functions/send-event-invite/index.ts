// supabase/functions/send-event-invite/index.ts
//
// 発表会・イベントの案内を保護者へ送る（設計書 4.6.3 / 11章）。
//
// 入力: { event_id }
// 出力: { sent, skipped, failed }
//
// 呼び出し元は public.publish_event()（画面の「保護者に案内する」）。
//
// 方針
//  ・宛先は世帯の請求先保護者。未登録・メール未入力の生徒は skipped に残す。
//    黙って飛ばすと「あの家だけ届いていない」の原因が分からなくなる。
//  ・出欠の回答を促すのが目的なので、期限を必ず本文に入れる。
//    期限が無いときは、その行を出さない（「期限: —」は意味が無い）。
//  ・参加費は「いくらを、どうやって集めるか」を1行で書く。金額だけ書くと
//    当日いくら持たせればよいのかが分からない。
//  ・同じ案内を二度送らない。DB 側にも部分一意索引がある。
//  ・すでに答えた保護者には送らない。催促にしかならない。

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { corsHeaders, siteUrl } from "../_shared/cors.ts";
import { mailFrom } from "../_shared/mail-from.ts";
import { sendMail } from "../_shared/resend-send.ts";
import { bodyToHtml, renderEmail } from "../_shared/render-email.ts";

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

/** timestamptz → 11月3日(火) 13:00（JST） */
function whenLabel(iso: string, withTime = true): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const w = WEEKDAY[
    new Date(
      Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))),
    ).getUTCDay()
  ];
  const date = `${Number(get("month"))}月${Number(get("day"))}日(${w})`;
  return withTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** 集め方の書き方。月謝に合算するときは、何月分かまで書く。
 *  「月謝と一緒に」だけでは、いつ引かれるのかが保護者に分からない */
function feeLabel(collection: string, billingMonth: string | null): string {
  if (collection === "on_site") return "当日、会場でお支払いください";
  if (collection === "bank_transfer") return "事前にお振り込みください";
  if (collection === "with_tuition") {
    return billingMonth
      ? `${Number(billingMonth.slice(5, 7))}月分の月謝と一緒にご請求します`
      : "月謝と一緒にご請求します";
  }
  return "";
}


type EventRow = {
  id: string;
  organization_id: string;
  kind: string;
  title: string;
  venue: string | null;
  start_at: string;
  end_at: string | null;
  price: number | null;
  fee_collection: string;
  billing_month: string | null;
  fee_note: string | null;
  answer_deadline_at: string | null;
  description: string | null;
  status: string;
  is_public: boolean;
};

Deno.serve(async (req) => {
  cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { event_id } = await req.json();
    if (!event_id) return json({ error: "event_id が要ります" }, 400);

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        "id, organization_id, kind, title, venue, start_at, end_at, price, fee_collection, billing_month, fee_note, answer_deadline_at, description, status, is_public",
      )
      .eq("id", event_id)
      .maybeSingle<EventRow>();

    if (eventError) {
      console.error("イベントの取得に失敗しました", eventError);
      return json({ error: "server_error" }, 500);
    }
    if (!event) return json({ error: "not_found" }, 404);
    if (!event.is_public || event.status !== "planned") {
      return json({ sent: 0, skipped: 0, failed: 0, reason: "not_open" });
    }

    // まだ答えていない保護者だけに送る。答えた人への催促にはしない
    const { data: entries } = await supabase
      .from("event_entries")
      .select("id, student_id, status, students(name, household_id)")
      .eq("event_id", event.id)
      .eq("organization_id", event.organization_id)
      .eq("status", "invited");

    if (!entries || entries.length === 0) {
      return json({ sent: 0, skipped: 0, failed: 0, reason: "no_entries" });
    }

    // 既に送れているものは対象から外す
    const { data: already } = await supabase
      .from("deliveries")
      .select("event_entry_id")
      .eq("organization_id", event.organization_id)
      .eq("channel", "email")
      .eq("status", "sent")
      .in("event_entry_id", entries.map((e) => e.id));
    const sentIds = new Set((already ?? []).map((d) => d.event_entry_id));

    const { data: brand } = await supabase
      .from("brand_settings")
      .select("studio_name, email")
      .eq("organization_id", event.organization_id)
      .maybeSingle();

    const studioName = brand?.studio_name ?? "";
    const replyTo = brand?.email ?? undefined;

    const kindLabel = event.kind === "recital" ? "発表会" : "イベント";

    // 件名は通知のまとまりにも残すので、宛先の値を入れずに一度組み立てる
    const heading = await renderEmail(
      supabase,
      event.organization_id,
      "event_invited",
      { 種類: kindLabel, イベント名: event.title, スクール名: studioName },
    );
    const subject =
      heading?.subject ?? `【${kindLabel}】${event.title} 出欠のお願い`;

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({
        organization_id: event.organization_id,
        kind: "event_invited",
        subject,
      })
      .select("id")
      .single();

    if (notificationError || !notification) {
      console.error("通知の作成に失敗しました", notificationError);
      return json({ error: "server_error" }, 500);
    }

    const when =
      whenLabel(event.start_at) +
      (event.end_at ? `〜${whenLabel(event.end_at).split(" ")[1]}` : "");

    // 「いくらを、どうやって集めるか」を1つの値にする。金額だけでは、
    // 当日いくら持たせればよいのかが保護者に分からない
    const feeText =
      event.fee_collection === "none" || event.price == null || event.price === 0
        ? ""
        : yen(event.price) +
          (feeLabel(event.fee_collection, event.billing_month)
            ? `（${feeLabel(event.fee_collection, event.billing_month)}）`
            : "");

    const deadline = event.answer_deadline_at
      ? `${whenLabel(event.answer_deadline_at)} まで`
      : "";

    const link = siteUrl() ? `${siteUrl()}/my/events` : "";

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of entries) {
      if (sentIds.has(entry.id)) {
        skipped += 1;
        continue;
      }

      const student = entry.students as unknown as {
        name: string;
        household_id: string;
      } | null;

      const { data: guardian } = await supabase
        .from("guardians")
        .select("id, name, email")
        .eq("organization_id", event.organization_id)
        .eq("household_id", student?.household_id ?? "")
        .eq("is_billing_contact", true)
        .maybeSingle();

      // 送れない理由も1行として残す。黙って飛ばすと原因が追えない
      if (!guardian?.email) {
        await supabase.from("deliveries").insert({
          organization_id: event.organization_id,
          notification_id: notification.id,
          guardian_id: guardian?.id ?? null,
          event_entry_id: entry.id,
          channel: "email",
          status: "skipped",
          error: guardian
            ? "保護者にメールアドレスが登録されていません"
            : "保護者が登録されていません",
        });
        skipped += 1;
        continue;
      }

      const rendered = await renderEmail(
        supabase,
        event.organization_id,
        "event_invited",
        {
          保護者名: guardian.name,
          生徒名: student?.name ?? "",
          種類: kindLabel,
          イベント名: event.title,
          日時: when,
          会場: event.venue ?? "",
          参加費: feeText,
          "参加費の補足": event.fee_note ?? "",
          回答期限: deadline,
          マイページURL: link,
          案内文: event.description ?? "",
          スクール名: studioName,
        },
      );

      if (!rendered) {
        await supabase.from("deliveries").insert({
          organization_id: event.organization_id,
          notification_id: notification.id,
          guardian_id: guardian.id,
          event_entry_id: entry.id,
          channel: "email",
          to_address: guardian.email,
          status: "failed",
          error: "メールの文面を組み立てられませんでした",
        });
        failed += 1;
        continue;
      }

      const result = await sendMail(resend, {
        from: mailFrom(studioName),
        to: guardian.email,
        subject: rendered.subject,
        text: rendered.body,
        html: bodyToHtml(rendered.body),
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      await supabase.from("deliveries").insert({
        organization_id: event.organization_id,
        notification_id: notification.id,
        guardian_id: guardian.id,
        event_entry_id: entry.id,
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
    console.error("イベント案内の送信で例外", e);
    return json({ error: "server_error" }, 500);
  }
});
