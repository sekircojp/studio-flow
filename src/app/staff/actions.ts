"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceResult, AttendanceStatus, RosterKind } from "@/components/roster";
import type { ConfirmResult } from "@/components/attendance-sheet";
import { attendanceToTrialStatus, confirmAttendanceRows } from "@/lib/attendance";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "unconfirmed"];

/**
 * 講師による出欠の記録（設計書 9章 項目6）
 *
 * 管理画面側の同名処理と分けているのは、認可の入口が違うため。
 * こちらは講師ロールを通し、担当している回かどうかも確認する。
 *
 * 記録すると DB のトリガが lessons.has_attendance_record を立て、
 * この回はレッスンの作り直しで消えなくなる（設計書 5.1）。
 */
export async function recordAttendanceAsStaff(
  lessonId: string,
  studentId: string,
  status: AttendanceStatus,
  kind: RosterKind = "enrolled",
): Promise<AttendanceResult> {
  const { membership, userId, instructor } = await requireStaff();
  if (!STATUSES.includes(status)) {
    return { ok: false, error: "出欠の値が正しくありません。" };
  }
  if (!instructor) {
    return { ok: false, error: "講師として登録されていません。" };
  }

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // 自分が担当している回か確認する。画面を迂回して他人の回を
  // 書き換えられないようにするため（設計書 7章）
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, lesson_instructors!inner(instructor_id)")
    .eq("id", lessonId)
    .eq("organization_id", orgId)
    .eq("lesson_instructors.instructor_id", instructor.id)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "担当していない回です。" };

  // 体験の生徒は students に行が無い。trials.status で出欠を表す。
  // 担当講師かどうかは DB 関数の中でも確かめる
  if (kind === "trial") {
    const { error } = await supabase.rpc("record_trial_attendance", {
      p_trial_id: studentId,
      p_status: attendanceToTrialStatus(status),
    });
    if (error) {
      console.error("体験の出欠の記録に失敗しました", error);
      return { ok: false, error: "時間をおいてもう一度お試しください。" };
    }
    revalidatePath(`/staff/lessons/${lessonId}`);
    revalidatePath("/staff");
    return { ok: true };
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!student) return { ok: false, error: "その生徒が見つかりませんでした。" };

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
  revalidatePath(`/staff/lessons/${lessonId}`);
  revalidatePath("/staff");
  return { ok: true };
}

/**
 * 担当回を実施済みにする / 予定に戻す
 *
 * 休講の判断は運営側のものなので、講師の画面からは行わせない。
 * 当日の急な休講はスタジオが /admin から設定する。
 */
/** 講師による「この回の出欠を確定する」。担当している回だけ */
export async function confirmAttendanceAsStaff(lessonId: string): Promise<ConfirmResult> {
  const { membership, userId, instructor } = await requireStaff();
  if (!instructor) return { ok: false, error: "講師として登録されていません。" };
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, class_id, date, status, lesson_instructors!inner(instructor_id)")
    .eq("id", lessonId)
    .eq("organization_id", orgId)
    .eq("lesson_instructors.instructor_id", instructor.id)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "担当していない回です。" };
  if (lesson.status === "canceled") return { ok: false, error: "休講の回は確定できません。" };

  const result = await confirmAttendanceRows(supabase, orgId, lesson, userId);
  if (result.ok) {
    revalidatePath(`/staff/lessons/${lessonId}`);
    revalidatePath("/staff");
  }
  return result;
}

export async function setLessonHeldAsStaff(
  lessonId: string,
  status: "scheduled" | "held",
) {
  const { membership, instructor } = await requireStaff();
  if (!instructor) return;

  const supabase = await createClient();

  // 自分が担当している回か確認する。update では結合で絞れないので先に引く
  const { data: mine } = await supabase
    .from("lessons")
    .select("id, lesson_instructors!inner(instructor_id)")
    .eq("id", lessonId)
    .eq("organization_id", membership.organizationId)
    .eq("lesson_instructors.instructor_id", instructor.id)
    .maybeSingle();
  if (!mine) return;

  const { error } = await supabase
    .from("lessons")
    .update({ status })
    .eq("id", lessonId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("レッスンの状態変更に失敗しました", error);
  revalidatePath(`/staff/lessons/${lessonId}`);
  revalidatePath("/staff");
}
