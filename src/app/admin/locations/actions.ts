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
 * スタジオの登録
 *
 * スタジオ・ルームはオーナーとスタッフが編集できる（設計書 7章のスタッフの担当店舗に対応）。
 * 個別権限の仕組みはフェーズ1に無いため、いまは両者を同じ扱いにしている。
 *
 * 最初のルームは DB 関数 create_location() が一緒に作る。1部屋しかない
 * スタジオの人に「ルーム名」を考えさせないため（設計書 4.1）。
 * 2件の INSERT を同じトランザクションに入れて、ルームの無いスタジオを
 * 残さないようにしている。
 */
export async function createLocation(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  if (!name) return { error: "スタジオ名を入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_location", {
    p_organization_id: membership.organizationId,
    p_name: name,
    p_address: orNull(formData.get("address")),
    p_tel: orNull(formData.get("tel")),
    p_room_name: orNull(formData.get("room_name")),
  });

  if (error) {
    console.error("スタジオの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * ルームの登録
 *
 * organization_id は locations と揃える必要がある。DB 側にも複合外部キーが
 * あるため食い違えば弾かれるが、アプリ層でも所属を確認してから入れる。
 *
 * 収容人数は受け取らない。定員の判定はクラス側の2つの数字で行うため
 * （設計書 5.2）。rooms.capacity の列は残してあるが、画面からは触らない。
 */
export async function createRoom(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  const locationId = orNull(formData.get("location_id"));
  if (!name) return { error: "ルーム名を入力してください。" };
  if (!locationId) return { error: "スタジオを選んでください。" };

  const supabase = await createClient();

  // 指定されたスタジオが自テナントのものか、アプリ層でも確認する（設計書 3章）
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!location) return { error: "そのスタジオは見つかりませんでした。" };

  const { error } = await supabase.from("rooms").insert({
    organization_id: membership.organizationId,
    location_id: locationId,
    name,
  });

  if (error) {
    console.error("ルームの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/locations");
  return { ok: true };
}

/**
 * 閉鎖 / 再開
 *
 * 運営していたスタジオはこちらで表す。一覧の「閉鎖したスタジオ」に移るだけで、
 * 過去のレッスンや出欠は残る。
 */
export async function setLocationActive(locationId: string, isActive: boolean) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("locations")
    .update({ is_active: isActive })
    .eq("id", locationId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("スタジオの状態変更に失敗しました", error);
  revalidatePath("/admin/locations");
}

/**
 * スタジオの完全削除
 *
 * 間違えて登録したスタジオを消すためのもの。実績のあるスタジオは消せない。
 * スタジオを消すと スタジオ → ルーム → クラス → レッスン → 出欠 が芋づるで
 * 消えることになり、「スタジオの情報だけ消して他は残す」意図と逆になるため。
 *
 * 削除そのものは DB 側の関数 delete_location() が行う。
 * ルームとスタジオを1つのトランザクションで消し、外部キーに阻まれたら
 * ルームの削除ごと巻き戻る。
 */
export async function deleteLocation(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  await requireAdmin();

  const locationId = orNull(formData.get("location_id"));
  if (!locationId) return { error: "スタジオが指定されていません。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_location", {
    target_location_id: locationId,
  });

  if (error) {
    console.error("スタジオの削除に失敗しました", error);

    // 23503 = 外部キー違反。使われているスタジオを消そうとした場合
    if (error.code === "23503") {
      return {
        error:
          "このスタジオはすでに使われているため削除できません。閉鎖にしてください（過去のデータは残ります）。",
      };
    }
    return { error: "削除できませんでした。" };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  return { ok: true };
}
