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

export async function createClass(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const name = orNull(formData.get("name"));
  const seasonId = orNull(formData.get("season_id"));
  const roomId = orNull(formData.get("room_id"));
  const startTime = orNull(formData.get("start_time"));
  const endTime = orNull(formData.get("end_time"));
  const dayOfWeek = toInt(formData.get("day_of_week"));

  if (!name) return { error: "クラス名を入力してください。" };
  if (!seasonId) return { error: "期を選んでください。" };
  if (!roomId) return { error: "部屋を選んでください。" };
  if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "曜日を選んでください。" };
  }
  if (!startTime || !endTime) return { error: "時間を入力してください。" };
  if (startTime >= endTime) {
    return { error: "終了時刻は開始時刻より後にしてください。" };
  }

  const monthlyFee = toInt(formData.get("monthly_fee")) ?? 0;
  if (monthlyFee < 0) return { error: "月謝は0以上で入力してください。" };

  const supabase = await createClient();

  // 期と部屋が自テナントのものか、アプリ層でも確認する（設計書 3章）
  const [{ data: season }, { data: room }] = await Promise.all([
    supabase
      .from("seasons")
      .select("id")
      .eq("id", seasonId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (!season) return { error: "その期は見つかりませんでした。" };
  if (!room) return { error: "その部屋は見つかりませんでした。" };

  const { error } = await supabase.from("classes").insert({
    organization_id: orgId,
    season_id: seasonId,
    room_id: roomId,
    instructor_id: orNull(formData.get("instructor_id")),
    name,
    genre: orNull(formData.get("genre")),
    level: orNull(formData.get("level")),
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    enrollment_capacity: toInt(formData.get("enrollment_capacity")),
    room_capacity: toInt(formData.get("room_capacity")),
    monthly_fee: monthlyFee,
  });

  if (error) {
    console.error("クラスの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/classes");
  return { ok: true };
}

/**
 * レッスンの一括生成（設計書 5.1）
 *
 * 実処理は DB 関数 generate_lessons() に置いている。削除と生成を
 * 同じトランザクションで行い、途中で失敗しても「消えただけ」の
 * 状態を残さないため。
 *
 * 出欠が記録された回と、実施済み・休講にした回は作り直しの対象から外れる。
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
  if (r?.kept_attendance) parts.push(`出欠済み ${r.kept_attendance} 回はそのまま`);

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  return { ok: true, message: parts.join(" / ") };
}
