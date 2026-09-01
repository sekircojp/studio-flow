"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type AttendanceState = { ok?: boolean; error?: string };

const STATUSES = ["present", "absent", "late", "unconfirmed"] as const;
export type AttendanceStatus = (typeof STATUSES)[number];

/**
 * 出欠の記録
 *
 * 1レッスン×1生徒で1行。押すたびに上書きし、行は増やさない。
 * 記録者と記録時刻を残すのは、代講のときに後から確認できるようにするため。
 *
 * unconfirmed 以外を入れると、DB のトリガが lessons.has_attendance_record を
 * 立てる。これによりレッスンの作り直しでこの回が消えなくなる（設計書 5.1）。
 */
export async function recordAttendance(
  lessonId: string,
  studentId: string,
  status: AttendanceStatus,
) {
  const { membership, userId } = await requireAdmin();
  if (!STATUSES.includes(status)) return;

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // そのレッスンと生徒が自テナントのものか、アプリ層でも確認する（設計書 3章）
  const [{ data: lesson }, { data: student }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id")
      .eq("id", lessonId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (!lesson || !student) return;

  const { error } = await supabase.from("attendances").upsert(
    {
      organization_id: orgId,
      lesson_id: lessonId,
      student_id: studentId,
      status,
      recorded_by: status === "unconfirmed" ? null : userId,
      recorded_at: status === "unconfirmed" ? null : new Date().toISOString(),
    },
    { onConflict: "lesson_id,student_id" },
  );

  if (error) console.error("出欠の記録に失敗しました", error);
  revalidatePath(`/admin/attendance/${lessonId}`);
  revalidatePath("/admin/attendance");
}

/**
 * レッスンを実施済みにする / 予定に戻す
 *
 * 休講は別の操作。休講にした回は保護者のカレンダーにも休講として出る（設計書 5.1）。
 */
export async function setLessonStatus(
  lessonId: string,
  status: "scheduled" | "held" | "canceled",
  cancelReason?: string,
) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("lessons")
    .update({
      status,
      cancel_reason: status === "canceled" ? (cancelReason ?? null) : null,
    })
    .eq("id", lessonId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("レッスンの状態変更に失敗しました", error);
  revalidatePath(`/admin/attendance/${lessonId}`);
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");
}
