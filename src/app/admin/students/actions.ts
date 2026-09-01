"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { STUDENT_STATUSES } from "@/lib/students";

export type StudentState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function isDate(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 生徒の登録
 *
 * 新しい世帯の場合は、世帯・保護者・生徒を DB 関数 create_student() が
 * 1つのトランザクションで作る。画面から3回に分けて呼ぶと、途中で失敗したときに
 * 「生徒のいない世帯」が残り、households は削除できないため掃除できない。
 */
export async function createStudent(
  _prev: StudentState,
  formData: FormData,
): Promise<StudentState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  if (!name) return { error: "生徒名を入力してください。" };

  const status = orNull(formData.get("status")) ?? "trial";
  if (!STUDENT_STATUSES.some((s) => s.value === status)) {
    return { error: "在籍状態の値が不正です。" };
  }

  const birthDate = orNull(formData.get("birth_date"));
  const enrolledOn = orNull(formData.get("enrolled_on"));
  if (birthDate && !isDate(birthDate)) return { error: "生年月日が不正です。" };
  if (enrolledOn && !isDate(enrolledOn)) return { error: "入会日が不正です。" };

  const householdId = orNull(formData.get("household_id"));
  const householdName = orNull(formData.get("household_name"));

  if (!householdId && !householdName) {
    return { error: "世帯を選ぶか、新しい世帯の名前を入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_student", {
    p_organization_id: membership.organizationId,
    p_name: name,
    p_name_kana: orNull(formData.get("name_kana")),
    p_birth_date: birthDate,
    p_gender: orNull(formData.get("gender")),
    p_grade: orNull(formData.get("grade")),
    p_enrolled_on: enrolledOn,
    p_status: status,
    p_note: orNull(formData.get("note")),
    p_household_id: householdId,
    p_household_name: householdName,
    p_guardian_name: orNull(formData.get("guardian_name")),
    p_guardian_relationship: orNull(formData.get("guardian_relationship")),
    p_guardian_email: orNull(formData.get("guardian_email")),
    p_guardian_tel: orNull(formData.get("guardian_tel")),
  });

  if (error) {
    console.error("生徒の登録に失敗しました", error);
    if (error.message?.includes("household_name_required")) {
      return { error: "新しい世帯の名前を入力してください。" };
    }
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 在籍状態の変更
 *
 * 退会も行を消さず status で表す（設計書 2章・4.3）。
 * 休会は請求ありと請求停止の2種類あり、混ぜると件数が合わなくなる。
 */
export async function setStudentStatus(studentId: string, status: string) {
  const { membership } = await requireAdmin();
  if (!STUDENT_STATUSES.some((s) => s.value === status)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ status })
    .eq("id", studentId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("在籍状態の変更に失敗しました", error);
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin");
}

/** 世帯に保護者を追加する */
export async function createGuardian(
  _prev: StudentState,
  formData: FormData,
): Promise<StudentState> {
  const { membership } = await requireAdmin();

  const householdId = orNull(formData.get("household_id"));
  const name = orNull(formData.get("name"));
  if (!householdId) return { error: "世帯が指定されていません。" };
  if (!name) return { error: "保護者名を入力してください。" };

  const supabase = await createClient();

  // その世帯が自テナントのものか、アプリ層でも確認する（設計書 3章）
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!household) return { error: "その世帯は見つかりませんでした。" };

  const { error } = await supabase.from("guardians").insert({
    organization_id: membership.organizationId,
    household_id: householdId,
    name,
    name_kana: orNull(formData.get("name_kana")),
    relationship: orNull(formData.get("relationship")),
    email: orNull(formData.get("email")),
    tel: orNull(formData.get("tel")),
    emergency_contact: orNull(formData.get("emergency_contact")),
  });

  if (error) {
    console.error("保護者の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/students");
  return { ok: true };
}

/**
 * 採寸の記録
 *
 * 履歴として積む。生徒の属性として単一の値を持たない（設計書 4.3）。
 * 子どもは成長するため、いつ時点の数値かが分からないと使えない。
 */
export async function createMeasurement(
  _prev: StudentState,
  formData: FormData,
): Promise<StudentState> {
  const { membership } = await requireAdmin();

  const studentId = orNull(formData.get("student_id"));
  const measuredAt = orNull(formData.get("measured_at"));
  if (!studentId) return { error: "生徒が指定されていません。" };
  if (!isDate(measuredAt)) return { error: "採寸日を入力してください。" };

  const num = (key: string) => {
    const v = orNull(formData.get(key));
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!student) return { error: "その生徒は見つかりませんでした。" };

  const { error } = await supabase.from("student_measurements").insert({
    organization_id: membership.organizationId,
    student_id: studentId,
    measured_at: measuredAt,
    height: num("height"),
    shoe_size: num("shoe_size"),
    wear_size: orNull(formData.get("wear_size")),
    note: orNull(formData.get("note")),
  });

  if (error) {
    console.error("採寸の記録に失敗しました", error);
    return { error: "記録できませんでした。" };
  }

  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}
