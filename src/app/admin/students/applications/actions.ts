"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ApplicationState = { ok?: boolean; error?: string; message?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 入会申込の承認（設計書 4.6）
 *
 * 実処理は DB 関数 approve_enrollment_application()。世帯・保護者・生徒と、
 * 希望クラスがあれば在籍までを同じトランザクションで作る。
 *
 * 申込に入っていたメールアドレスがそのまま保護者の行に入るので、
 * 保護者が同じアドレスでログインすれば、自分の子どもに結びつく。
 */
export async function approveApplication(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  await requireAdmin();

  const id = orNull(formData.get("application_id"));
  if (!id) return { error: "申込が指定されていません。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_enrollment_application", {
    p_application_id: id,
    p_status: orNull(formData.get("status")) ?? "active",
  });

  if (error) {
    console.error("入会申込の承認に失敗しました", error);
    if (error.message?.includes("already_reviewed")) {
      return { error: "この申込は既に処理されています。" };
    }
    return { error: "承認できませんでした。" };
  }

  revalidatePath("/admin/students/applications");
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return { ok: true, message: "生徒として登録しました。" };
}

/**
 * 入会申込の見送り
 *
 * 行は消さない。状態を変えるだけ（CLAUDE.md）。同じ人から再度申込が
 * あったときに、前回の経緯が分かるようにするため。
 */
export async function declineApplication(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const { membership } = await requireAdmin();

  const id = orNull(formData.get("application_id"));
  if (!id) return { error: "申込が指定されていません。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollment_applications")
    .update({
      status: "declined",
      reviewed_at: new Date().toISOString(),
      decline_reason: orNull(formData.get("decline_reason")),
    })
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .eq("status", "pending");

  if (error) {
    console.error("入会申込の見送りに失敗しました", error);
    return { error: "処理できませんでした。" };
  }

  revalidatePath("/admin/students/applications");
  return { ok: true };
}
