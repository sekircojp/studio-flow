"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/components/roster";

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
) {
  const { membership, userId, instructor } = await requireStaff();
  if (!STATUSES.includes(status)) return;
  if (!instructor) return;

  const supabase = await createClient();
  const orgId = membership.organizationId;

  // 自分が担当している回か確認する。画面を迂回して他人の回を
  // 書き換えられないようにするため（設計書 7章）
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .eq("organization_id", orgId)
    .eq("instructor_id", instructor.id)
    .maybeSingle();
  if (!lesson) return;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!student) return;

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
  revalidatePath(`/staff/lessons/${lessonId}`);
  revalidatePath("/staff");
}

/**
 * 担当回を実施済みにする / 予定に戻す
 *
 * 休講の判断は運営側のものなので、講師の画面からは行わせない。
 * 当日の急な休講はスタジオが /admin から設定する。
 */
export async function setLessonHeldAsStaff(
  lessonId: string,
  status: "scheduled" | "held",
) {
  const { membership, instructor } = await requireStaff();
  if (!instructor) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("lessons")
    .update({ status })
    .eq("id", lessonId)
    .eq("organization_id", membership.organizationId)
    .eq("instructor_id", instructor.id);

  if (error) console.error("レッスンの状態変更に失敗しました", error);
  revalidatePath(`/staff/lessons/${lessonId}`);
  revalidatePath("/staff");
}
