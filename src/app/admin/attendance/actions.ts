"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceResult, RosterKind } from "@/components/roster";
import type { ConfirmResult } from "@/components/attendance-sheet";
import { attendanceToTrialStatus, confirmAttendanceRows } from "@/lib/attendance";

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
 *
 * 結果は必ず返す。黙って失敗すると、画面だけ変わって DB に入っていない
 * 状態に押した人が気づけない（名簿側で「保存できませんでした」を出す）。
 */
export async function recordAttendance(
  lessonId: string,
  studentId: string,
  status: AttendanceStatus,
  kind: RosterKind = "enrolled",
): Promise<AttendanceResult> {
  const { membership, userId } = await requireAdmin();
  if (!STATUSES.includes(status)) {
    return { ok: false, error: "出欠の値が正しくありません。" };
  }

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // 体験の生徒は students に行が無い。trials.status で出欠を表す
  if (kind === "trial") {
    return recordTrial(supabase, orgId, lessonId, studentId, status);
  }

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
  if (!lesson || !student) {
    return { ok: false, error: "そのレッスンか生徒が見つかりませんでした。" };
  }

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

  if (error) {
    console.error("出欠の記録に失敗しました", error);
    return { ok: false, error: "時間をおいてもう一度お試しください。" };
  }
  revalidatePath(`/admin/attendance/${lessonId}`);
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");
  return { ok: true };
}

/** 体験の出欠。認可は DB 関数の中（運営か、その回の担当講師） */
async function recordTrial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  lessonId: string,
  trialId: string,
  status: AttendanceStatus,
): Promise<AttendanceResult> {
  const { data: trial } = await supabase
    .from("trials")
    .select("id")
    .eq("id", trialId)
    .eq("organization_id", orgId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!trial) return { ok: false, error: "その体験の申込が見つかりませんでした。" };

  const { error } = await supabase.rpc("record_trial_attendance", {
    p_trial_id: trialId,
    p_status: attendanceToTrialStatus(status),
  });
  if (error) {
    console.error("体験の出欠の記録に失敗しました", error);
    return { ok: false, error: "時間をおいてもう一度お試しください。" };
  }
  revalidatePath(`/admin/attendance/${lessonId}`);
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/students/trials");
  return { ok: true };
}

/**
 * この回の出欠を確定する（未記録の生徒を出席・欠席連絡があれば欠席として保存）
 */
export async function confirmAttendance(lessonId: string): Promise<ConfirmResult> {
  const { membership, userId } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, class_id, date, status")
    .eq("id", lessonId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "そのレッスンが見つかりませんでした。" };
  if (lesson.status === "canceled") return { ok: false, error: "休講の回は確定できません。" };

  const result = await confirmAttendanceRows(supabase, orgId, lesson, userId);
  if (result.ok) {
    revalidatePath(`/admin/attendance/${lessonId}`);
    revalidatePath("/admin/attendance");
    revalidatePath("/admin");
  }
  return result;
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
