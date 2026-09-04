"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; error?: string };

/** 空文字は null にする。未入力と空文字を DB 上で区別しないため */
function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 基本設定の保存
 *
 * 設計書 7章のとおり、画面の出し分けとは別に、ここでも必ず認可する。
 * requireOwner() は /admin へリダイレクトするため、スタッフが直接
 * このアクションを叩いても更新できない。
 */
export async function saveBrandSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { membership } = await requireOwner();
  const orgId = membership.organizationId;

  const studioName = orNull(formData.get("studio_name"));
  const brandColor = orNull(formData.get("brand_color"));

  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return { error: "ブランドカラーは #RRGGBB の形式で入力してください。" };
  }

  const supabase = await createClient();

  // brand_settings は organization_id が主キー。無ければ作り、あれば更新する
  const { error } = await supabase.from("brand_settings").upsert(
    {
      organization_id: orgId,
      studio_name: studioName,
      brand_color: brandColor,
      tel: orNull(formData.get("tel")),
      email: orNull(formData.get("email")),
      address: orNull(formData.get("address")),
      website: orNull(formData.get("website")),
      invoice_registration_number: orNull(
        formData.get("invoice_registration_number"),
      ),
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("brand_settings の保存に失敗しました", error);
    return { error: "保存できませんでした。入力内容を確認してください。" };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
