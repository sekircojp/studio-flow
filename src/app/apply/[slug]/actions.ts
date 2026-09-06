"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type ApplyState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 公開ページからの入会申込（設計書 4.6）
 * ────────────────────────────────────────────────
 * ログイン不要で呼ばれる。実処理は DB 関数
 * submit_enrollment_application()。作れる行の形を関数側で固定してあるので、
 * 列を自由に指定されることはない。
 *
 * ★ ここでは service_role を使う。
 *   未ログインの利用者なので、anon の鍵では RLS に阻まれる。
 *   ただし呼べるのはこの1つの関数だけで、関数はテナントを slug から
 *   引き直すため、他テナントに書き込むことはできない。
 *
 * ★ 承認するまで名簿には入らない。
 *   誰でも投稿できる入口なので、いたずらや重複がそのまま生徒として
 *   登録されると困る。オーナーが見てから承認する。
 */
export async function submitApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const slug = orNull(formData.get("slug"));
  const studentName = orNull(formData.get("student_name"));
  const guardianName = orNull(formData.get("guardian_name"));
  const email = orNull(formData.get("email"));

  if (!slug) return { error: "申込先が分かりませんでした。" };
  if (!studentName) return { error: "お子さまのお名前を入力してください。" };
  if (!guardianName) return { error: "保護者のお名前を入力してください。" };
  if (!email) {
    return {
      error:
        "メールアドレスを入力してください。マイページへのログインに使います。",
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("submit_enrollment_application", {
    p_slug: slug,
    p_student_name: studentName,
    p_guardian_name: guardianName,
    p_email: email,
    p_student_name_kana: orNull(formData.get("student_name_kana")),
    p_birth_date: orNull(formData.get("birth_date")),
    p_gender: orNull(formData.get("gender")),
    p_grade: orNull(formData.get("grade")),
    p_guardian_name_kana: orNull(formData.get("guardian_name_kana")),
    p_relationship: orNull(formData.get("relationship")),
    p_tel: orNull(formData.get("tel")),
    p_address: orNull(formData.get("address")),
    p_desired_class_id: orNull(formData.get("desired_class_id")),
    p_note: orNull(formData.get("note")),
  });

  if (error) {
    console.error("入会申込の登録に失敗しました", error);
    if (error.message?.includes("invalid_email")) {
      return { error: "メールアドレスの形式をご確認ください。" };
    }
    if (error.message?.includes("too_many_submissions")) {
      return {
        error:
          "短い時間に何度も送信されました。しばらく待ってからお試しください。",
      };
    }
    if (error.message?.includes("studio_not_found")) {
      return { error: "申込先が見つかりませんでした。" };
    }
    return { error: "送信できませんでした。時間をおいてお試しください。" };
  }

  return { ok: true };
}
