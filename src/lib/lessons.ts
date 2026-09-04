import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * レッスンに付いた「今日の変更」を数える
 * ────────────────────────────────────────────────
 * 当日の運営で真っ先に知りたいのは、いつもと違う点である。
 *
 *   欠席連絡 … その回を休むと連絡が来ている人数
 *   振替     … その回に他のクラスから振り替えて来る人数
 *
 * どちらもオーナー・スタッフ・講師が参照できる（設計書 7章の RLS）。
 * 講師にとっては「今日は誰が来ないか・誰が増えるか」がそのまま現場の情報
 * なので、管理者と同じものを出す。金額に関わる情報は含まない。
 *
 * ★ "use client" のファイルに置かないこと。Server Component から読む。
 */
export type LessonFlags = {
  absences: number;
  transfersIn: number;
};

export const NO_FLAGS: LessonFlags = { absences: 0, transfersIn: 0 };

/**
 * 複数レッスンぶんをまとめて数える。
 * レッスン1件ごとに問い合わせると、1日ぶんでも回数が増えるため。
 */
export async function fetchLessonFlags(
  supabase: SupabaseClient,
  organizationId: string,
  lessonIds: string[],
): Promise<Map<string, LessonFlags>> {
  const flags = new Map<string, LessonFlags>();
  if (lessonIds.length === 0) return flags;

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: absences }, { data: bookings }] = await Promise.all([
    supabase
      .from("absence_requests")
      .select("lesson_id")
      .eq("organization_id", organizationId)
      .in("lesson_id", lessonIds),
    supabase
      .from("transfer_bookings")
      .select("lesson_id")
      .eq("organization_id", organizationId)
      .in("lesson_id", lessonIds)
      // 取り消した予約は来ない
      .is("canceled_at", null),
  ]);

  const bump = (id: string, key: keyof LessonFlags) => {
    const current = flags.get(id) ?? { absences: 0, transfersIn: 0 };
    current[key] += 1;
    flags.set(id, current);
  };

  for (const a of (absences ?? []) as { lesson_id: string }[]) {
    bump(a.lesson_id, "absences");
  }
  for (const b of (bookings ?? []) as { lesson_id: string }[]) {
    bump(b.lesson_id, "transfersIn");
  }

  return flags;
}
