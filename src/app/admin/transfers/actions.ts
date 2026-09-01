"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type TransferState = { ok?: boolean; error?: string; message?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function toInt(v: FormDataEntryValue | null): number | null {
  const s = orNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/** 振替の失敗理由を、利用者向けの日本語にする */
const REASONS: Record<string, string> = {
  credit_not_available: "この振替権はすでに使用済みか、無効です。",
  credit_expired: "振替権の有効期限が切れています。",
  lesson_canceled: "その回は休講です。別の回を選んでください。",
  scope_same_class: "設定により、同じクラスの回にしか振り替えられません。",
  scope_same_genre: "設定により、同じジャンルのクラスにしか振り替えられません。",
  class_rejects_transfer: "そのクラスは振替を受け付けていません。",
  monthly_limit_reached: "その月の振替回数の上限に達しています。",
  room_capacity_reached: "その回は定員に達しています。",
  forbidden: "権限がありません。",
};

function toMessage(error: { message?: string } | null): string {
  const raw = error?.message ?? "";
  for (const [code, text] of Object.entries(REASONS)) {
    if (raw.includes(code)) return text;
  }
  return "処理できませんでした。";
}

/**
 * 欠席連絡（設計書 5.3）
 *
 * 期限内かどうかの判定と振替権の発行は DB 関数 submit_absence() が行う。
 * 期限は組織ごとの設定値。出欠にも「欠席」を立てるので、名簿を開けば分かる。
 */
export async function submitAbsence(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  await requireAdmin();

  const studentId = orNull(formData.get("student_id"));
  const lessonId = orNull(formData.get("lesson_id"));
  if (!studentId || !lessonId) {
    return { error: "生徒とレッスンを指定してください。" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_absence", {
    p_student_id: studentId,
    p_lesson_id: lessonId,
    p_reason: orNull(formData.get("reason")),
  });

  if (error) {
    console.error("欠席連絡に失敗しました", error);
    return { error: toMessage(error) };
  }

  const r = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/transfers");
  revalidatePath(`/admin/attendance/${lessonId}`);

  return {
    ok: true,
    message: r?.granted
      ? `欠席を記録し、振替権を発行しました（${r.expires_on} まで）`
      : "欠席を記録しました。期限を過ぎているため振替権は発行していません。",
  };
}

/**
 * 振替の予約（設計書 5.2 / 5.3）
 *
 * 範囲・上限回数・実収容上限の判定は DB 関数 book_transfer() が行う。
 * 判定をアプリ側に置くと、複数人が同時に予約したときに定員を超えうる。
 */
export async function bookTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  await requireAdmin();

  const creditId = orNull(formData.get("credit_id"));
  const lessonId = orNull(formData.get("lesson_id"));
  if (!creditId || !lessonId) {
    return { error: "振替権と振替先を指定してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("book_transfer", {
    p_credit_id: creditId,
    p_lesson_id: lessonId,
  });

  if (error) {
    console.error("振替の予約に失敗しました", error);
    return { error: toMessage(error) };
  }

  revalidatePath("/admin/transfers");
  return { ok: true, message: "振替を予約しました。" };
}

/** 期限切れの振替権を閉じる */
export async function expireCredits(): Promise<void> {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("expire_transfer_credits", {
    p_organization_id: membership.organizationId,
  });
  if (error) console.error("期限切れの処理に失敗しました", error);
  revalidatePath("/admin/transfers");
}

/** 振替ルールの保存（オーナーのみ） */
export async function saveTransferSettings(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const { membership } = await requireOwner();
  const supabase = await createClient();

  const { error } = await supabase.from("transfer_settings").upsert(
    {
      organization_id: membership.organizationId,
      absence_deadline_hours: toInt(formData.get("absence_deadline_hours")) ?? 2,
      credit_valid_days: toInt(formData.get("credit_valid_days")) ?? 60,
      monthly_limit: toInt(formData.get("monthly_limit")) ?? 2,
      scope: orNull(formData.get("scope")) ?? "same_class",
      restore_on_absence: formData.get("restore_on_absence") === "on",
      grant_on_no_contact: formData.get("grant_on_no_contact") === "on",
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("振替ルールの保存に失敗しました", error);
    return { error: "保存できませんでした。" };
  }

  revalidatePath("/admin/transfers");
  return { ok: true };
}
