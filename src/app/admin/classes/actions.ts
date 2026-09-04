"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ClassState = { ok?: boolean; error?: string; message?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function toInt(v: FormDataEntryValue | null): number | null {
  const s = orNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/**
 * 開催枠（class_meetings）の読み取り
 *
 * フォームからは meeting_day / meeting_start / meeting_end / meeting_room が
 * 同じ数だけ並んで届く。同じ位置どうしが1つの枠になる。
 */
type MeetingInput = {
  room_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

function readMeetings(formData: FormData): MeetingInput[] | string {
  const days = formData.getAll("meeting_day");
  const starts = formData.getAll("meeting_start");
  const ends = formData.getAll("meeting_end");
  const rooms = formData.getAll("meeting_room");

  if (days.length === 0) return "開催する曜日と時間を1つ以上入れてください。";
  if (
    starts.length !== days.length ||
    ends.length !== days.length ||
    rooms.length !== days.length
  ) {
    return "開催枠の入力が揃っていません。";
  }

  const meetings: MeetingInput[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = toInt(days[i]);
    const start = orNull(starts[i]);
    const end = orNull(ends[i]);
    const room = orNull(rooms[i]);

    if (day === null || day < 0 || day > 6) return "曜日を選んでください。";
    if (!room) return "部屋を選んでください。";
    if (!start || !end) return "開始時刻と終了時刻を入れてください。";
    if (start >= end) return "終了時刻は開始時刻より後にしてください。";

    // 同じ曜日・同じ開始時刻は DB の一意制約に当たるので、先に弾く
    if (meetings.some((m) => m.day_of_week === day && m.start_time === start)) {
      return "同じ曜日・同じ開始時刻の枠が重複しています。";
    }
    meetings.push({
      room_id: room,
      day_of_week: day,
      start_time: start,
      end_time: end,
    });
  }
  return meetings;
}

/** 部屋がすべて自テナントのものか確認する（設計書 3章） */
async function roomsBelongToOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  roomIds: string[],
): Promise<boolean> {
  const unique = [...new Set(roomIds)];
  const { data } = await supabase
    .from("rooms")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", unique);
  return (data ?? []).length === unique.length;
}

/**
 * クラスの作成（設計書 4.2）
 *
 * クラスは週に何回開いてもよい。「初級クラス（週2回）」は1クラスで、
 * 開催枠を2件持つ。クラス数の数え方が運営の感覚と合うようにするため。
 */
export async function createClass(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const name = orNull(formData.get("name"));
  const seasonId = orNull(formData.get("season_id"));
  if (!name) return { error: "クラス名を入力してください。" };
  if (!seasonId) return { error: "期を選んでください。" };

  const meetings = readMeetings(formData);
  if (typeof meetings === "string") return { error: meetings };

  const monthlyFee = toInt(formData.get("monthly_fee")) ?? 0;
  if (monthlyFee < 0) return { error: "月謝は0以上で入力してください。" };

  const supabase = await createClient();

  const [{ data: season }, roomsOk] = await Promise.all([
    supabase
      .from("seasons")
      .select("id")
      .eq("id", seasonId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    roomsBelongToOrg(supabase, orgId, meetings.map((m) => m.room_id)),
  ]);
  if (!season) return { error: "その期は見つかりませんでした。" };
  if (!roomsOk) return { error: "その部屋は見つかりませんでした。" };

  // クラスと開催枠は同じトランザクションで作る。
  // 途中で失敗すると「開催日の無いクラス」が残り、画面からは消せない
  const { error } = await supabase.rpc("create_class", {
    p_organization_id: orgId,
    p_season_id: seasonId,
    p_name: name,
    p_meetings: meetings,
    p_genre: orNull(formData.get("genre")),
    p_level: orNull(formData.get("level")),
    p_instructor_id: orNull(formData.get("instructor_id")),
    p_enrollment_capacity: toInt(formData.get("enrollment_capacity")),
    p_room_capacity: toInt(formData.get("room_capacity")),
    p_monthly_fee: monthlyFee,
  });

  if (error) {
    console.error("クラスの登録に失敗しました", error);
    if (error.code === "23505") {
      return { error: "同じ曜日・同じ開始時刻の枠が重複しています。" };
    }
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/classes");
  return { ok: true };
}

/** 既存クラスに開催枠を足す（週1回 → 週2回にする） */
export async function addClassMeeting(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const classId = orNull(formData.get("class_id"));
  if (!classId) return { error: "クラスが指定されていません。" };

  const meetings = readMeetings(formData);
  if (typeof meetings === "string") return { error: meetings };

  const supabase = await createClient();

  const [{ data: cls }, roomsOk] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    roomsBelongToOrg(supabase, orgId, meetings.map((m) => m.room_id)),
  ]);
  if (!cls) return { error: "そのクラスは見つかりませんでした。" };
  if (!roomsOk) return { error: "その部屋は見つかりませんでした。" };

  const { error } = await supabase.from("class_meetings").insert(
    meetings.map((m) => ({ organization_id: orgId, class_id: classId, ...m })),
  );

  if (error) {
    console.error("開催枠の追加に失敗しました", error);
    if (error.code === "23505") {
      return { error: "同じ曜日・同じ開始時刻の枠が既にあります。" };
    }
    return { error: "追加できませんでした。" };
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  return { ok: true, message: "開催枠を追加しました。「作り直す」でレッスンに反映されます。" };
}

/**
 * 開催枠の停止・再開
 *
 * 物理削除はしない（CLAUDE.md）。停止すると、次に「作り直す」を押したときに
 * その曜日の予定が作られなくなる。出欠を記録した回は残る。
 */
export async function setClassMeetingActive(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const meetingId = orNull(formData.get("meeting_id"));
  const next = formData.get("is_active") === "true";
  if (!meetingId) return { error: "開催枠が指定されていません。" };

  const supabase = await createClient();

  // 最後の1枠を止めると、開催日の無いクラスになる
  if (!next) {
    const { data: target } = await supabase
      .from("class_meetings")
      .select("class_id")
      .eq("id", meetingId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!target) return { error: "その開催枠は見つかりませんでした。" };

    const { count } = await supabase
      .from("class_meetings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("class_id", target.class_id)
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return { error: "最後の開催枠は止められません。先に別の枠を追加してください。" };
    }
  }

  const { error } = await supabase
    .from("class_meetings")
    .update({ is_active: next, updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("開催枠の更新に失敗しました", error);
    return { error: "変更できませんでした。" };
  }

  revalidatePath("/admin/classes");
  return {
    ok: true,
    message: next
      ? "再開しました。「作り直す」でレッスンに反映されます。"
      : "停止しました。「作り直す」を押すと、予定のままの回が消えます。",
  };
}

/**
 * レッスンの一括生成（設計書 5.1）
 *
 * 実処理は DB 関数 generate_lessons() に置いている。削除と生成を
 * 同じトランザクションで行い、途中で失敗しても「消えただけ」の
 * 状態を残さないため。
 *
 * 出欠・欠席連絡・振替・キャンセル待ちが付いた回と、実施済み・休講にした回は
 * 作り直しの対象から外れる。
 */
export async function generateLessons(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  await requireAdmin();

  const classId = orNull(formData.get("class_id"));
  if (!classId) return { error: "クラスが指定されていません。" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_lessons", {
    target_class_id: classId,
  });

  if (error) {
    console.error("レッスンの生成に失敗しました", error);
    return { error: "レッスンを生成できませんでした。" };
  }

  const r = Array.isArray(data) ? data[0] : data;
  const parts = [`${r?.created ?? 0} 回を作成`];
  if (r?.skipped_closures) parts.push(`休講日 ${r.skipped_closures} 日を除外`);
  if (r?.kept_attendance) parts.push(`記録のある ${r.kept_attendance} 回はそのまま`);

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  return { ok: true, message: parts.join(" / ") };
}
