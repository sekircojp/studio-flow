"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { tokyoLocalToIso } from "@/lib/date";
import type {
  EntryStatus,
  EventAttendance,
} from "@/components/event-roster";

export type EventState = { ok?: boolean; error?: string; message?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** 円は整数で受け取る（設計書 2.2）。小数や記号が混ざったら弾く */
function toYen(v: FormDataEntryValue | null): number | null | "invalid" {
  const s = typeof v === "string" ? v.trim().replace(/[,¥￥\s]/g, "") : "";
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return "invalid";
  return Number(s);
}

function toCount(v: FormDataEntryValue | null): number | null | "invalid" {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "") return null;
  if (!/^\d+$/.test(s) || Number(s) === 0) return "invalid";
  return Number(s);
}

const AUDIENCES = ["all", "classes", "selected"] as const;
const FEE_COLLECTIONS = [
  "none",
  "on_site",
  "with_tuition",
  "bank_transfer",
  "other",
] as const;

/**
 * 発表会・イベントの登録（設計書 4.6.3）
 *
 * ★ 作った時点では保護者に公開しない。
 *   会場や日時が固まってから「保護者に案内する」を押す。押した時点で
 *   公開され、案内メールが飛ぶ。作った瞬間にメールが出ると、下書きの
 *   段階の日時が保護者に届いてしまう。
 *
 * ★ 会場は自由入力。
 *   発表会は市民ホールなど、普段のスタジオ以外で開かれることが多いため、
 *   locations とは紐づけない（移行 038）。
 */
export async function createEvent(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const title = orNull(formData.get("title"));
  const startRaw = orNull(formData.get("start_at"));
  const endRaw = orNull(formData.get("end_at"));
  const deadlineRaw = orNull(formData.get("answer_deadline_at"));
  const kind = formData.get("kind") === "recital" ? "recital" : "event";

  if (!title) return { error: "名前を入力してください。" };
  if (!startRaw) return { error: "開催日時を入力してください。" };

  const startAt = tokyoLocalToIso(startRaw);
  if (!startAt) return { error: "開催日時の形式を確認してください。" };

  const endAt = endRaw ? tokyoLocalToIso(endRaw) : null;
  if (endRaw && !endAt) return { error: "終了日時の形式を確認してください。" };
  if (endAt && endAt <= startAt) {
    return { error: "終了日時は開始日時より後にしてください。" };
  }

  const deadlineAt = deadlineRaw ? tokyoLocalToIso(deadlineRaw) : null;
  if (deadlineRaw && !deadlineAt) {
    return { error: "回答期限の形式を確認してください。" };
  }
  if (deadlineAt && deadlineAt > startAt) {
    return { error: "回答期限は開催日時より前にしてください。" };
  }

  const capacity = toCount(formData.get("capacity"));
  if (capacity === "invalid") return { error: "定員は1以上の数で入力してください。" };

  const price = toYen(formData.get("price"));
  if (price === "invalid") return { error: "参加費は円単位の整数で入力してください。" };

  const audienceRaw = String(formData.get("audience") ?? "selected");
  const audience = (AUDIENCES as readonly string[]).includes(audienceRaw)
    ? audienceRaw
    : "selected";

  const feeRaw = String(formData.get("fee_collection") ?? "on_site");
  const feeCollection = (FEE_COLLECTIONS as readonly string[]).includes(feeRaw)
    ? feeRaw
    : "on_site";

  const classIds = formData
    .getAll("class_id")
    .filter((v): v is string => typeof v === "string" && v !== "");

  if (audience === "classes" && classIds.length === 0) {
    return { error: "案内するクラスを選んでください。" };
  }

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organization_id: orgId,
      kind,
      title,
      venue: orNull(formData.get("venue")),
      start_at: startAt,
      end_at: endAt,
      answer_deadline_at: deadlineAt,
      capacity,
      price,
      audience,
      fee_collection: feeCollection,
      fee_note: orNull(formData.get("fee_note")),
      // 案内するまでは保護者に見せない（上のコメントを参照）
      is_public: false,
      description: orNull(formData.get("description")),
    })
    .select("id")
    .single();

  if (error || !event) {
    console.error("イベントの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  if (audience === "classes") {
    const { error: classError } = await supabase
      .from("event_target_classes")
      .insert(
        classIds.map((id) => ({
          organization_id: orgId,
          event_id: event.id,
          class_id: id,
        })),
      );
    if (classError) {
      console.error("案内先クラスの登録に失敗しました", classError);
      return { error: "クラスを登録できませんでした。イベントは作成済みです。" };
    }
  }

  // 全体・クラス指定なら、その場で名簿を作る。個別なら画面から1人ずつ足す
  if (audience !== "selected") {
    const { error: rosterError } = await supabase.rpc("build_event_roster", {
      p_event_id: event.id,
    });
    if (rosterError) {
      console.error("名簿の作成に失敗しました", rosterError);
    }
  }

  revalidatePath("/admin/events");
  return { ok: true };
}

/**
 * 保護者に案内する（公開する＋案内メールを送る）
 *
 * ★ 公開と案内メールを1つの操作にする。
 *   「公開したのにメールを送り忘れた」「メールを送ったのにマイページに
 *   出ていない」を構造的に無くす。
 *
 * ★ すでに答えた保護者には送らない。
 *   あとから名簿に足した生徒がいる場合、もう一度押せばその人にだけ届く。
 *   判定は Edge Function 側と DB の部分一意索引の両方で行う。
 */
export async function publishEvent(eventId: string): Promise<EventState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_event", { p_event_id: eventId });

  if (error) {
    console.error("イベントの公開に失敗しました", error);
    return { error: "案内できませんでした。" };
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  return { ok: true, message: "案内を送りました" };
}

/** 案内先の設定から名簿を作り直す（すでにいる生徒には触れない） */
export async function rebuildRoster(eventId: string): Promise<EventState> {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("build_event_roster", {
    p_event_id: eventId,
  });

  if (error) {
    console.error("名簿の作成に失敗しました", error);
    return { error: "名簿を作れませんでした。" };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return {
    ok: true,
    message: data === 0 ? "加わる生徒はいませんでした" : `${data} 人を加えました`,
  };
}

/**
 * 開催済みにする / 予定に戻す / 中止にする
 *
 * 行は消さない（CLAUDE.md）。中止にしても名簿と出欠は残る。
 */
export async function setEventStatus(
  eventId: string,
  status: "planned" | "held" | "canceled",
  cancelReason?: string,
) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("events")
    .update({
      status,
      cancel_reason: status === "canceled" ? (cancelReason ?? null) : null,
    })
    .eq("id", eventId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("イベントの状態変更に失敗しました", error);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
}

/**
 * 名簿に生徒を個別に加える
 *
 * 全体・クラス指定の場合は build_event_roster がまとめて作るが、
 * そこから漏れる生徒（他クラスから助っ人で出るなど）を足すために残す。
 *
 * ★ すでに名簿にいる生徒は飛ばす。もう一度加えても状態は変えない。
 *   参加しないと答えた生徒が、追加操作のたびに「未回答」へ戻ってしまうと
 *   返事が消える。
 */
export async function addEventEntries(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const eventId = String(formData.get("event_id") ?? "");
  if (!eventId) return { error: "イベントが指定されていません。" };

  const studentIds = formData
    .getAll("student_id")
    .filter((v): v is string => typeof v === "string" && v !== "");

  if (studentIds.length === 0) {
    return { error: "加える生徒を選んでください。" };
  }

  const supabase = await createClient();

  // イベントと生徒が自テナントのものか、アプリ層でも確かめる（設計書 3章）
  const [{ data: event }, { data: students }] = await Promise.all([
    supabase
      .from("events")
      .select("id, price")
      .eq("id", eventId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("students")
      .select("id")
      .eq("organization_id", orgId)
      .in("id", studentIds),
  ]);

  if (!event) return { error: "そのイベントは見つかりませんでした。" };

  const valid = new Set((students ?? []).map((s) => s.id));

  const { data: existing } = await supabase
    .from("event_entries")
    .select("student_id")
    .eq("event_id", eventId)
    .eq("organization_id", orgId);

  const already = new Set((existing ?? []).map((e) => e.student_id));
  const rows = studentIds
    .filter((id) => valid.has(id) && !already.has(id))
    .map((id) => ({
      organization_id: orgId,
      event_id: eventId,
      student_id: id,
      amount: event.price ?? null,
    }));

  if (rows.length === 0) {
    return { error: "選んだ生徒はすでに名簿に入っています。" };
  }

  const { error } = await supabase.from("event_entries").insert(rows);
  if (error) {
    console.error("名簿への追加に失敗しました", error);
    return { error: "追加できませんでした。" };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true };
}

const ENTRY_STATUSES: EntryStatus[] = [
  "invited",
  "entered",
  "undecided",
  "declined",
  "canceled",
];

/**
 * 参加の意思を運営側から記録する
 *
 * 保護者が答えられない場合（メール未登録、電話で聞いた場合）に使う。
 * 答えた時刻を残すのは、「まだ答えていない」と「答えたうえで不参加」を
 * 区別するため。
 */
export async function setEntryStatus(entryId: string, status: EntryStatus) {
  const { membership, userId } = await requireAdmin();
  if (!ENTRY_STATUSES.includes(status)) return;

  const supabase = await createClient();
  const { data: entry, error } = await supabase
    .from("event_entries")
    .update({
      status,
      answered_at: status === "invited" ? null : new Date().toISOString(),
      answered_by: status === "invited" ? null : userId,
    })
    .eq("id", entryId)
    .eq("organization_id", membership.organizationId)
    .select("event_id")
    .maybeSingle();

  if (error) console.error("参加可否の記録に失敗しました", error);
  if (entry) revalidatePath(`/admin/events/${entry.event_id}`);
}

const ATTENDANCES: EventAttendance[] = ["present", "absent", "unconfirmed"];

/**
 * 当日の出欠を記録する
 *
 * 名簿の行を上書きする。レッスンの出欠と同じで、行は増やさない。
 * 記録者と記録時刻を残すのは、当日に複数のスタッフが手分けして
 * 記録するため（誰が入れたか後から分かるように）。
 */
export async function recordEventAttendance(
  entryId: string,
  attendance: EventAttendance,
) {
  const { membership, userId } = await requireAdmin();
  if (!ATTENDANCES.includes(attendance)) return;

  const supabase = await createClient();
  const { data: entry, error } = await supabase
    .from("event_entries")
    .update({
      attendance,
      attendance_recorded_by: attendance === "unconfirmed" ? null : userId,
      attendance_recorded_at:
        attendance === "unconfirmed" ? null : new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("organization_id", membership.organizationId)
    .select("event_id")
    .maybeSingle();

  if (error) console.error("出欠の記録に失敗しました", error);
  if (entry) revalidatePath(`/admin/events/${entry.event_id}`);
}
