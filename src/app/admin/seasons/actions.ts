"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type SeasonState = { ok?: boolean; error?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** YYYY-MM-DD かどうか。date 列にそのまま渡すので変換はしない（設計書 2.1） */
function isDate(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function createSeason(
  _prev: SeasonState,
  formData: FormData,
): Promise<SeasonState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  const start = orNull(formData.get("start_date"));
  const end = orNull(formData.get("end_date"));

  if (!name) return { error: "期の名前を入力してください。" };
  if (!isDate(start) || !isDate(end)) {
    return { error: "開始日と終了日を入力してください。" };
  }
  if (start > end) {
    return { error: "終了日は開始日より後にしてください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("seasons").insert({
    organization_id: membership.organizationId,
    name,
    start_date: start,
    end_date: end,
  });

  if (error) {
    console.error("期の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/seasons");
  return { ok: true };
}

/**
 * 「今の期」を切り替える
 *
 * 組織内で is_current が真の行は1件だけ（部分一意索引で担保）。
 * 先に全部を false にしてから対象を true にする。逆順だと索引に弾かれる。
 *
 * 2つの更新の間で処理が落ちると「今の期」が無い状態になるが、
 * もう一度選び直せば直る。取り返しのつかない壊れ方はしない。
 */
export async function setCurrentSeason(seasonId: string) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const { error: clearError } = await supabase
    .from("seasons")
    .update({ is_current: false })
    .eq("organization_id", orgId)
    .eq("is_current", true);

  if (clearError) {
    console.error("今の期の解除に失敗しました", clearError);
    return;
  }

  const { error } = await supabase
    .from("seasons")
    .update({ is_current: true })
    .eq("id", seasonId)
    .eq("organization_id", orgId);

  if (error) console.error("今の期の設定に失敗しました", error);
  revalidatePath("/admin/seasons");
}

export async function createClosure(
  _prev: SeasonState,
  formData: FormData,
): Promise<SeasonState> {
  const { membership } = await requireAdmin();

  const date = orNull(formData.get("date"));
  const name = orNull(formData.get("name"));
  const locationId = orNull(formData.get("location_id"));

  if (!isDate(date)) return { error: "日付を入力してください。" };
  if (!name) return { error: "名前を入力してください（例: 年末年始）。" };

  const supabase = await createClient();

  // 校舎を指定した場合は、自テナントのものかアプリ層でも確認する
  if (locationId) {
    const { data: loc } = await supabase
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();
    if (!loc) return { error: "その校舎は見つかりませんでした。" };
  }

  const { error } = await supabase.from("studio_closures").insert({
    organization_id: membership.organizationId,
    date,
    name,
    location_id: locationId,
  });

  if (error) {
    console.error("休講日の登録に失敗しました", error);
    // 23505 = 一意制約違反。同じ日・同じ校舎がすでにある
    if (error.code === "23505") {
      return { error: "その日はすでに休講日として登録されています。" };
    }
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/seasons");
  return { ok: true };
}

/**
 * 休講日の削除
 *
 * 休講日は日付の一覧で、他のテーブルから参照されない。
 * レッスンは生成時に休講日を「除外する」だけなので、消しても
 * 失われる履歴が無い。間違えて入れた日は消せるほうがよい。
 */
export async function deleteClosure(closureId: string) {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("studio_closures")
    .delete()
    .eq("id", closureId)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("休講日の削除に失敗しました", error);
  revalidatePath("/admin/seasons");
}
