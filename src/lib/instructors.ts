/**
 * 担当講師の表示（設計書 4.2、2026-10-12 の複数担当化）
 *
 * クラスもレッスンも、担当は class_instructors / lesson_instructors の
 * 行として複数持つ。画面では並び順どおりに名前を「・」でつないで出す。
 *
 * Supabase の select はこう書く:
 *   lesson_instructors(display_order, instructors(name))
 *   class_instructors(display_order, is_active, instructors(name))
 */

export type InstructorJoin = {
  display_order: number;
  is_active?: boolean;
  instructors: { name: string } | null;
};

/** 並び順どおりの名前の配列。退職などで引けない行は飛ばす */
export function instructorNames(rows: InstructorJoin[] | null | undefined): string[] {
  return [...(rows ?? [])]
    .filter((r) => r.is_active !== false)
    .sort((a, b) => a.display_order - b.display_order)
    .map((r) => r.instructors?.name)
    .filter((n): n is string => Boolean(n));
}

/** 画面に出す1行。未定なら null */
export function instructorLabel(
  rows: InstructorJoin[] | null | undefined,
): string | null {
  const names = instructorNames(rows);
  return names.length === 0 ? null : names.join("・");
}
