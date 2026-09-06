"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type TrialState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 公開ページからの体験・見学の申込（設計書 4.6 / 5.2）
 * ────────────────────────────────────────────────
 * 実処理は DB 関数 submit_trial_application()。
 *
 * ★ 空きの判定は関数の中で、行を作るのと同じトランザクションで行う。
 *   公開の入口なので、2人が同時に最後の1枠へ申し込むことがある。
 *   画面に「空きあり」と出した時点の数字は当てにならない。
 */
export async function submitTrial(
  _prev: TrialState,
  formData: FormData,
): Promise<TrialState> {
  const slug = orNull(formData.get("slug"));
  const lessonId = orNull(formData.get("lesson_id"));
  const studentName = orNull(formData.get("student_name"));
  const guardianName = orNull(formData.get("guardian_name"));
  const email = orNull(formData.get("email"));

  if (!slug) return { error: "申込先が分かりませんでした。" };
  if (!lessonId) return { error: "参加したい回を選んでください。" };
  if (!studentName) return { error: "お子さまのお名前を入力してください。" };
  if (!guardianName) return { error: "保護者のお名前を入力してください。" };
  if (!email) return { error: "メールアドレスを入力してください。" };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("submit_trial_application", {
    p_slug: slug,
    p_lesson_id: lessonId,
    p_student_name: studentName,
    p_guardian_name: guardianName,
    p_email: email,
    p_kind: orNull(formData.get("kind")) ?? "trial",
    p_student_name_kana: orNull(formData.get("student_name_kana")),
    p_birth_date: orNull(formData.get("birth_date")),
    p_grade: orNull(formData.get("grade")),
    p_tel: orNull(formData.get("tel")),
    p_note: orNull(formData.get("note")),
  });

  if (error) {
    console.error("体験申込の登録に失敗しました", error);
    const message = error.message ?? "";
    if (message.includes("lesson_full")) {
      return {
        error:
          "その回は満席になりました。お手数ですが、別の回をお選びください。",
      };
    }
    if (message.includes("duplicate key")) {
      return { error: "その回には、このメールアドレスで既に申し込み済みです。" };
    }
    if (message.includes("invalid_email")) {
      return { error: "メールアドレスの形式をご確認ください。" };
    }
    if (message.includes("lesson_past") || message.includes("lesson_not_open")) {
      return { error: "その回は受け付けを終了しました。別の回をお選びください。" };
    }
    if (message.includes("trial_not_accepted")) {
      return { error: "そのクラスは体験を受け付けていません。" };
    }
    if (message.includes("too_many_submissions")) {
      return {
        error: "短い時間に何度も送信されました。しばらく待ってからお試しください。",
      };
    }
    return { error: "送信できませんでした。時間をおいてお試しください。" };
  }

  return { ok: true };
}
