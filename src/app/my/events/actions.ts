"use server";

import { revalidatePath } from "next/cache";
import { requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";

export type MyEventState = { ok?: boolean; error?: string };

const ANSWERS = ["entered", "undecided", "declined"];

/**
 * 保護者が参加の可否を答える（設計書 4.6.3）
 *
 * ★ 実処理は DB 関数 answer_event_entry()。
 *   RLS は行単位で列を選べないため、保護者に update 権限を渡すと当日の
 *   出欠まで書き換えられる。触れるのは status だけ、という制限を関数側で
 *   固定してある（移行 038 / 039）。
 *
 * 自分の世帯の生徒かどうかと、回答期限を過ぎていないかも関数の中で
 * 確かめるので、この画面を迂回して呼ばれても越権できない。
 */
export async function answerEvent(
  _prev: MyEventState,
  formData: FormData,
): Promise<MyEventState> {
  await requireMy();

  const entryId = String(formData.get("entry_id") ?? "");
  const answer = String(formData.get("answer") ?? "");
  if (!entryId) return { error: "対象が分かりませんでした。" };
  if (!ANSWERS.includes(answer)) return { error: "その回答は選べません。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_event_entry", {
    p_entry_id: entryId,
    p_answer: answer,
  });

  if (error) {
    console.error("参加可否の回答に失敗しました", error);
    if (
      error.message?.includes("deadline_passed") ||
      error.message?.includes("event_past")
    ) {
      return { error: "回答の期限が過ぎています。スタジオへご連絡ください。" };
    }
    if (
      error.message?.includes("event_closed") ||
      error.message?.includes("event_not_public") ||
      error.message?.includes("entry_canceled")
    ) {
      return { error: "この回は受け付けていません。" };
    }
    if (error.message?.includes("not_allowed")) {
      return { error: "その回答はできません。" };
    }
    return { error: "送信できませんでした。時間をおいてお試しください。" };
  }

  revalidatePath("/my/events");
  return { ok: true };
}
