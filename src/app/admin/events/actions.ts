"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { tokyoLocalToIso } from "@/lib/date";
import type {
  EntryStatus,
  EventAttendance,
} from "@/components/event-roster";

export type EventState = { ok?: boolean; error?: string };

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

/**
 * 発表会・イベントの登録（設計書 4.6）
 *
 * 会場は自由入力。発表会は市民ホールなど、普段のスタジオ以外で開かれる
 * ことが多いため、locations とは紐づけない（移行 038）。
 */
export async function createEvent(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const { membership } = await requireAdmin();

  const title = orNull(formData.get("title"));
  const startRaw = orNull(formData.get("start_at"));
  const endRaw = orNull(formData.get("end_at"));
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

  const capacity = toCount(formData.get("capacity"));
  if (capacity === "invalid") return { error: "定員は1以上の数で入力してください。" };

  const price = toYen(formData.get("price"));
  if (price === "invalid") return { error: "参加費は円単位の整数で入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    organization_id: membership.organizationId,
    kind,
    title,
    venue: orNull(formData.get("venue")),
    start_at: startAt,
    end_at: endAt,
    capacity,
    price,
    is_public: formData.get("is_public") === "on",
    description: orNull(formData.get("description")),
  });

  if (error) {
    console.error("イベントの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/events");
  return { ok: true };
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
 * 名簿に生徒を加える（声をかけた状態で入る）
 *
 * ★ クラス単位でまとめて加えられるようにする。
 *   発表会は「このクラスは全員出る」という決まり方をするのが普通で、
 *   1人ずつ選ばせると数十回の操作になる。
 *
 * ★ すでに名簿にいる生徒は飛ばす。もう一度加えても状態は変えない。
 *   参加しないと答えた生徒が、追加操作のたびに「声をかけた」へ
 *   戻ってしまうと、返事が消える。
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

const ENTRY_STATUSES: EntryStatus[] = ["invited", "entered", "declined", "canceled"];

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

const ATTENDANCES: EventAttendance[] = ["present", "absent", "late", "unconfirmed"];

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
