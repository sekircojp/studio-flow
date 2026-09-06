"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type TrialAdminState = { ok?: boolean; error?: string };

/**
 * 体験の結果を記録する（設計書 4.6）
 *
 * 行は消さない。状態を変えるだけ（CLAUDE.md）。来なかった回も、
 * 見送りになった回も、次に問い合わせが来たときの手がかりになる。
 *
 * 入会が決まったら「入会」にしたうえで、生徒として登録するのは
 * 入会申込か手入力で行う。ここで自動的に名簿へ入れると、
 * 保護者の連絡先や兄弟の扱いを確認しないまま登録してしまう。
 */
export async function setTrialStatus(
  _prev: TrialAdminState,
  formData: FormData,
): Promise<TrialAdminState> {
  const { membership } = await requireAdmin();

  const id = typeof formData.get("trial_id") === "string"
    ? (formData.get("trial_id") as string)
    : "";
  const status = typeof formData.get("status") === "string"
    ? (formData.get("status") as string)
    : "";

  const allowed = ["booked", "attended", "no_show", "enrolled", "declined", "canceled"];
  if (!id) return { error: "体験申込が指定されていません。" };
  if (!allowed.includes(status)) return { error: "その状態は使えません。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("trials")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);

  if (error) {
    console.error("体験申込の更新に失敗しました", error);
    return { error: "変更できませんでした。" };
  }

  revalidatePath("/admin/students/trials");
  return { ok: true };
}
