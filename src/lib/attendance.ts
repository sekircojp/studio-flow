import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 出欠の名簿と、入力の進み具合
 * ────────────────────────────────────────────────
 * 「その回の名簿に誰が載るか」と「何人分の出欠が入ったか」は、出欠の画面・
 * 一覧・ダッシュボードのすべてで同じ答えにならないといけない。ここに
 * 1つだけ置き、画面ごとに数え方を書かない。
 *
 * 名簿のルール（設計書 4.4）
 *   その回の日付の時点で在籍している生徒。途中入会・途中退会があるので、
 *   在籍期間（enrollments.start_date / end_date）とレッスンの日付で絞る。
 *
 * 進み具合の見方
 *   記録済 … status が unconfirmed 以外の行の数
 *   対象   … 名簿の人数
 *   none    記録済 0          … 未入力
 *   partial 0 < 記録済 < 対象 … 入力中
 *   done    記録済 >= 対象    … 完了
 *   empty   対象 0            … 対象なし（在籍者がいない）
 *
 * ★ lessons.has_attendance_record とは別物。
 *   あちらは「1人でも記録したか」で、レッスンの作り直しから守るための
 *   フラグ（設計書 5.1）。1人入れただけで true になるので、「入力が終わった」
 *   の判定には使えない。意味を変えると作り直しの保護が壊れるので、触らない。
 *
 * ★ "use client" のファイルに置かないこと。Server Component から読む。
 */

export type RosterStudent = { id: string; name: string; kana: string | null };

export type AttendanceProgress = {
  total: number;
  recorded: number;
};

export type ProgressState = "none" | "partial" | "done" | "empty";

type EnrollmentRow = {
  student_id: string;
  class_id: string;
  start_date: string;
  end_date: string | null;
};

/** その日に在籍しているか */
export function enrolledOn(
  e: { start_date: string; end_date: string | null },
  date: string,
): boolean {
  return e.start_date <= date && (e.end_date === null || e.end_date >= date);
}

export function progressState(p: AttendanceProgress): ProgressState {
  if (p.total === 0) return "empty";
  if (p.recorded === 0) return "none";
  if (p.recorded < p.total) return "partial";
  return "done";
}

/** 「記録済 9 / 12・残り 3」のような1行 */
export function progressLabel(p: AttendanceProgress): string {
  const state = progressState(p);
  if (state === "empty") return "対象なし";
  if (state === "done") return `完了 ${p.recorded} / ${p.total}`;
  return `記録済 ${p.recorded} / ${p.total}・残り ${p.total - p.recorded}`;
}

/** その回の名簿。ふりがな順 */
export async function fetchRoster(
  supabase: SupabaseClient,
  organizationId: string,
  classId: string,
  date: string,
): Promise<RosterStudent[]> {
  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const { data } = await supabase
    .from("enrollments")
    .select("student_id, start_date, end_date, students(name, name_kana)")
    .eq("class_id", classId)
    .eq("organization_id", organizationId)
    .lte("start_date", date);

  type Row = {
    student_id: string;
    start_date: string;
    end_date: string | null;
    students: { name: string; name_kana: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((e) => enrolledOn(e, date))
    .map((e) => ({
      id: e.student_id,
      name: e.students?.name ?? "（生徒不明）",
      kana: e.students?.name_kana ?? null,
    }))
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja"));
}

/**
 * 複数レッスンぶんの進み具合をまとめて数える。
 * レッスン1件ごとに問い合わせると、1日ぶんでも回数が増えるため。
 */
export async function fetchAttendanceProgress(
  supabase: SupabaseClient,
  organizationId: string,
  lessons: { id: string; class_id: string; date: string }[],
): Promise<Map<string, AttendanceProgress>> {
  const result = new Map<string, AttendanceProgress>();
  if (lessons.length === 0) return result;

  const classIds = [...new Set(lessons.map((l) => l.class_id))];
  const lessonIds = lessons.map((l) => l.id);

  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, class_id, start_date, end_date")
      .eq("organization_id", organizationId)
      .in("class_id", classIds),
    supabase
      .from("attendances")
      .select("lesson_id, status")
      .eq("organization_id", organizationId)
      .in("lesson_id", lessonIds)
      .neq("status", "unconfirmed"),
  ]);

  const enrollmentRows = (enrollments ?? []) as EnrollmentRow[];
  const recordedBy = new Map<string, number>();
  for (const a of (attendances ?? []) as { lesson_id: string }[]) {
    recordedBy.set(a.lesson_id, (recordedBy.get(a.lesson_id) ?? 0) + 1);
  }

  for (const l of lessons) {
    const total = enrollmentRows.filter(
      (e) => e.class_id === l.class_id && enrolledOn(e, l.date),
    ).length;
    result.set(l.id, { total, recorded: recordedBy.get(l.id) ?? 0 });
  }
  return result;
}

/**
 * 終わったのに入力が終わっていない回。
 * 「終わった」は終了時刻で見る（当日の終わった回も含める）。休講は除く。
 * 対象 0 の回は「入力するものが無い」ので含めない。
 */
export async function fetchIncompleteLessons(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date = new Date(),
): Promise<
  {
    id: string;
    class_id: string;
    date: string;
    start_at: string;
    end_at: string;
    className: string;
    progress: AttendanceProgress;
  }[]
> {
  const { data } = await supabase
    .from("lessons")
    .select("id, class_id, date, start_at, end_at, status, classes(name)")
    .eq("organization_id", organizationId)
    .neq("status", "canceled")
    .lt("end_at", now.toISOString())
    .order("date", { ascending: false })
    .order("start_at", { ascending: false });

  type Row = {
    id: string;
    class_id: string;
    date: string;
    start_at: string;
    end_at: string;
    status: string;
    classes: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const progress = await fetchAttendanceProgress(supabase, organizationId, rows);

  return rows
    .map((l) => ({
      id: l.id,
      class_id: l.class_id,
      date: l.date,
      start_at: l.start_at,
      end_at: l.end_at,
      className: l.classes?.name ?? "（クラス不明）",
      progress: progress.get(l.id) ?? { total: 0, recorded: 0 },
    }))
    .filter((l) => {
      const s = progressState(l.progress);
      return s === "none" || s === "partial";
    });
}
