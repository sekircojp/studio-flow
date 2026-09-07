"use server";

import { revalidatePath } from "next/cache";
import { requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";

export type MyEventState = { ok?: boolean; error?: string };

/**
 * 保護者が参加の可否を答える（設計書 4.6）
 *
 * ★ 実処理は DB 関数 answer_event_entry()。
 *   RLS は行単位で列を選べないため、保護者に update 権限を渡すと当日の
 *   出欠まで書き換えられる。触れるのは status だけ、という制限を関数側で
 *   固定してある（移行 038）。
 *
 * 自分の世帯の生徒かどうかも関数の中で確かめるので、この画面を迂回して
 * 呼ばれても他人の子どもの返事は変えられない。
 */
export async function answerEvent(
  _prev: MyEventState,
  formData: FormData,
): Promise<MyEventState> {
  await requireMy();

  const entryId = String(formData.get("entry_id") ?? "");
  const going = formData.get("going") === "yes";
  if (!entryId) return { error: "対象が分かりませんでした。" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_event_entry", {
    p_entry_id: entryId,
    p_going: going,
  });

  if (error) {
    console.error("参加可否の回答に失敗しました", error);
    if (error.message?.includes("event_past")) {
      return { error: "受付が終了しています。スタジオへご連絡ください。" };
    }
    if (
      error.message?.includes("event_closed") ||
      error.message?.includes("event_not_public")
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
