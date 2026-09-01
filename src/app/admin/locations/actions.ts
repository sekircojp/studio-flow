"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type LocationState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 校舎の登録
 *
 * 校舎・部屋はオーナーとスタッフが編集できる（設計書 7章のスタッフの担当店舗に対応）。
 * 個別権限の仕組みはフェーズ1に無いため、いまは両者を同じ扱いにしている。
 */
export async function createLocation(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  if (!name) return { error: "校舎名を入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({
    organization_id: membership.organizationId,
    name,
    address: orNull(formData.get("address")),
    tel: orNull(formData.get("tel")),
  });

  if (error) {
    console.error("校舎の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/locations");
  return { ok: true };
}

/**
 * 部屋の登録
 *
 * organization_id は locations と揃える必要がある。DB 側にも複合外部キーが
 * あるため食い違えば弾かれるが、アプリ層でも所属を確認してから入れる。
 */
export async function createRoom(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  const locationId = orNull(formData.get("location_id"));
  if (!name) return { error: "部屋名を入力してください。" };
  if (!locationId) return { error: "校舎を選んでください。" };

  const capacityRaw = orNull(formData.get("capacity"));
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) {
    return { error: "収容人数は1以上の整数で入力してください。" };
  }

  const supabase = await createClient();

  // 指定された校舎が自テナントのものか、アプリ層でも確認する（設計書 3章）
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!location) return { error: "その校舎は見つかりませんでした。" };

  const { error } = await supabase.from("rooms").insert({
    organization_id: membership.organizationId,
    location_id: locationId,
    name,
    capacity,
  });

  if (error) {
    console.error("部屋の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/locations");
  return { ok: true };
}

/**
 * 校舎の休止 / 再開
 *
 * 物理削除はしない（設計書 2章・5.6）。is_active の切り替えで表す。
 */
export async function setLocationActive(locationId: string, isActive: boolean) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("locations")
    .update({ is_active: isActive })
    .eq("id", locationId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("校舎の状態変更に失敗しました", error);
  revalidatePath("/admin/locations");
}
