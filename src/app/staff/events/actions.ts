"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { EventAttendance } from "@/components/event-roster";

const ATTENDANCES: EventAttendance[] = ["present", "absent", "late", "unconfirmed"];

/**
 * 講師による発表会・イベントの出欠記録（設計書 4.6 / 9章 項目6）
 *
 * 管理画面側の同名処理と分けているのは、認可の入口が違うため。
 *
 * ★ レッスンと違い「担当」で絞らない。
 *   レッスンは instructor_id で担当が決まっているが、発表会には担当という
 *   概念がない。当日は講師が総出で当たり、受付にいる人が名簿を持つ。
 *   自テナントの回であることだけを確かめる。
 *
 * ★ 参加可否（entered / declined）は講師に触らせない。
 *   誰を出すかは運営の判断で、当日の会場で変えるものではない。
 *   休講の判断を講師の画面から外しているのと同じ考え方。
 *
 * ★ RLS だけでは列を分けられないことを承知のうえで、ここは関数化しない。
 *   event_entries の update ポリシーは講師も通す（attendance を書くため）
 *   ので、RLS の層だけで見ると講師は status も書ける。保護者のときは
 *   answer_event_entry() を挟んでこれを塞いだが、あちらは組織の外の人で、
 *   越えられると権限の境目そのものが壊れる。講師は組織の中の人で、名簿も
 *   生徒名も正規の手段で見えている。設計書 3章のとおり一次防御はアプリ層に
 *   置き、requireStaff() を通るこの関数から status を書かないことで担保する。
 *   金額（売上・報酬・未納）は別で、そちらは RLS 側で講師を外してある。
 */
export async function recordEventAttendanceAsStaff(
  entryId: string,
  attendance: EventAttendance,
) {
  const { membership, userId, instructor } = await requireStaff();
  if (!instructor) return;
  if (!ATTENDANCES.includes(attendance)) return;

  const supabase = await createClient();
  const { data: entry, error } = await supabase
    .from("event_entries")
    .update({
      attendance,
      attendance_recorded_by: attendance === "unconfirmed" ? null : userId,
      attendance_recorded_at:
        attendance === "unconfirmed" ? null : new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("organization_id", membership.organizationId)
    .select("event_id")
    .maybeSingle();

  if (error) console.error("出欠の記録に失敗しました", error);
  if (entry) revalidatePath(`/staff/events/${entry.event_id}`);
  revalidatePath("/staff/events");
}
