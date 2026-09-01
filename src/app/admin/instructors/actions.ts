"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type InstructorState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function createInstructor(
  _prev: InstructorState,
  formData: FormData,
): Promise<InstructorState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  if (!name) return { error: "講師名を入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase.from("instructors").insert({
    organization_id: membership.organizationId,
    name,
    name_kana: orNull(formData.get("name_kana")),
    tel: orNull(formData.get("tel")),
    email: orNull(formData.get("email")),
  });

  if (error) {
    console.error("講師の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/instructors");
  revalidatePath("/admin/classes");
  return { ok: true };
}

/**
 * 退職 / 復帰
 *
 * 物理削除はしない。担当していたレッスンの記録が残るため（設計書 2章）。
 */
export async function setInstructorActive(
  instructorId: string,
  isActive: boolean,
) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("instructors")
    .update({ is_active: isActive })
    .eq("id", instructorId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("講師の状態変更に失敗しました", error);
  revalidatePath("/admin/instructors");
  revalidatePath("/admin/classes");
}
