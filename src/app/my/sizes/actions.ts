"use server";

import { revalidatePath } from "next/cache";
import { requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";

export type SizeState = { ok?: boolean; error?: string };

/** 身長・靴のサイズは小数を許す（147.5 / 22.5）。全角と単位は落とす */
function toNumber(v: FormDataEntryValue | null): number | null | "invalid" {
  let s = typeof v === "string" ? v.trim() : "";
  if (s === "") return null;
  s = s
    .replace(/[０-９．]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/(cm|CM|センチ|㎝|\s)/g, "");
  if (!/^\d{1,3}(\.\d)?$/.test(s)) return "invalid";
  const n = Number(s);
  return n > 0 ? n : "invalid";
}

/**
 * 保護者が自分の子どもの採寸を登録する（設計書 4.3）
 *
 * ★ 衣装はイベントに紐づけない。
 *   発表会のたびに測り直すのではなく、保護者がいつでも更新できる形にする。
 *   運営がイベント側から見たいときは、そのときの最新値を引けばよい。
 *
 * ★ 上書きではなく履歴として積む。
 *   子どもは成長するので、いつ時点の数値かが分からないと使えない。
 *   「サイズの更新が必要」の判定も、最新の採寸日からの経過日数で行う。
 *
 * 実処理は DB 関数 record_measurement()。student_id を自由に指定されても
 * 自世帯かどうかを関数の中で確かめるので、他人の子どもの行は作れない。
 */
export async function recordMySize(
  _prev: SizeState,
  formData: FormData,
): Promise<SizeState> {
  const { students } = await requireMy();

  const studentId = String(formData.get("student_id") ?? "");
  if (!students.some((s) => s.id === studentId)) {
    return { error: "その生徒は選べません。" };
  }

  const height = toNumber(formData.get("height"));
  if (height === "invalid") {
    return { error: "身長は 138 や 147.5 のように入力してください。" };
  }

  const shoeSize = toNumber(formData.get("shoe_size"));
  if (shoeSize === "invalid") {
    return { error: "靴のサイズは 22 や 22.5 のように入力してください。" };
  }

  const wearSize = String(formData.get("wear_size") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (height === null && shoeSize === null && wearSize === "" && note === "") {
    return { error: "いずれか1つは入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_measurement", {
    p_student_id: studentId,
    p_height: height,
    p_wear_size: wearSize || null,
    p_shoe_size: shoeSize,
    p_note: note || null,
  });

  if (error) {
    console.error("採寸の登録に失敗しました", error);
    return { error: "登録できませんでした。時間をおいてお試しください。" };
  }

  revalidatePath("/my/sizes");
  return { ok: true };
}
