import type { EntryChange } from "@/components/event-roster";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = {
  target_id: string | null;
  actor_name: string | null;
  created_at: string;
  before: Record<string, string> | null;
  after: Record<string, string> | null;
};

/**
 * 名簿の行ごとの変更履歴を引く（移行 043）
 *
 * ★ 管理画面と講師の画面で同じものを出す。
 *   記録するのは講師なので、自分がつけた記録が誰にどう直されたかを
 *   見られないのは不便すぎる。
 *
 * ★ 1回の更新で status と attendance の両方が変わることは、いまの画面では
 *   起きない。それでも1行に両方入りうる形なので、項目ごとに分けて返す。
 */
export async function fetchEntryChanges(
  supabase: SupabaseClient,
  organizationId: string,
  entryIds: string[],
): Promise<Record<string, EntryChange[]>> {
  if (entryIds.length === 0) return {};

  const { data, error } = await supabase
    .from("audit_logs")
    .select("target_id, actor_name, created_at, before, after")
    .eq("organization_id", organizationId)
    .eq("target_type", "event_entry")
    .in("target_id", entryIds)
    .order("created_at", { ascending: false })
    .limit(300);

  // 履歴が出ないだけで名簿は使えるので、失敗しても画面は止めない
  if (error) {
    console.error("変更履歴の取得に失敗しました", error);
    return {};
  }

  const map: Record<string, EntryChange[]> = {};
  for (const row of (data ?? []) as Row[]) {
    if (!row.target_id) continue;
    for (const field of ["status", "attendance"] as const) {
      const after = row.after?.[field];
      if (after === undefined) continue;
      (map[row.target_id] ??= []).push({
        at: row.created_at,
        actor: row.actor_name,
        field,
        before: row.before?.[field] ?? null,
        after,
      });
    }
  }
  return map;
}
