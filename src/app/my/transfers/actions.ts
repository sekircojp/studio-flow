"use server";

import { revalidatePath } from "next/cache";
import { requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";

export type MyAbsenceState = { ok?: boolean; error?: string; message?: string };

/**
 * 保護者からの欠席連絡（設計書 9章 項目10）
 *
 * 自分の世帯の生徒かどうかは、requireMy() が返す一覧で確認する。
 * DB 関数 submit_absence() の側でも同じ判定を行うので、この画面を
 * 迂回して直接呼ばれても他人の欠席は登録できない。
 */
export async function submitMyAbsence(
  _prev: MyAbsenceState,
  formData: FormData,
): Promise<MyAbsenceState> {
  const { students } = await requireMy();

  const studentId = String(formData.get("student_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!students.some((s) => s.id === studentId)) {
    return { error: "その生徒は選べません。" };
  }
  if (!lessonId) return { error: "休む回を選んでください。" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_absence", {
    p_student_id: studentId,
    p_lesson_id: lessonId,
    p_reason: reason || null,
  });

  if (error) {
    console.error("欠席連絡に失敗しました", error);
    return { error: "送信できませんでした。時間をおいてお試しください。" };
  }

  const r = Array.isArray(data) ? data[0] : data;
  revalidatePath("/my/transfers");
  revalidatePath("/my");

  return {
    ok: true,
    message: r?.granted
      ? `欠席を承りました。振替の権利を発行しました（${r.expires_on} まで）。`
      : "欠席を承りました。受付期限を過ぎているため、振替の権利は発行されません。",
  };
}
