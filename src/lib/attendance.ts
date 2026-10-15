import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 出欠の名簿と、入力の進み具合
 * ────────────────────────────────────────────────
 * 「その回の名簿に誰が載るか」と「何人分の出欠が入ったか」は、出欠の画面・
 * 一覧・ダッシュボードのすべてで同じ答えにならないといけない。ここに
 * 1つだけ置き、画面ごとに数え方を書かない。
 *
 * 名簿のルール（設計書 4.4 / 5.2。2026-10-16 に振替・体験を追加）
 *   enrolled … その回の日付の時点で在籍している生徒。途中入会・途中退会が
 *              あるので、在籍期間（enrollments）とレッスンの日付で絞る
 *   transfer … 振替でこの回に来る生徒（transfer_bookings。取消は除く）
 *   trial    … 体験・見学で来る人（trials。承認済み = booked / attended / no_show）
 *
 * 出欠の置き場
 *   在籍・振替 … attendances（生徒の行がある）
 *   体験       … trials.status（入会前で生徒の行が無い。attended / no_show）
 *
 * 進み具合の見方
 *   記録済 … 在籍・振替は status が unconfirmed 以外の行、体験は attended / no_show
 *   対象   … 名簿の人数（3種の合計）
 *   none    記録済 0          … 未入力
 *   partial 0 < 記録済 < 対象 … 入力中
 *   done    記録済 >= 対象    … 完了
 *   empty   対象 0            … 対象なし
 *
 * ★ lessons.has_attendance_record とは別物。
 *   あちらは「1人でも記録したか」で、レッスンの作り直しから守るための
 *   フラグ（設計書 5.1）。1人入れただけで true になるので、「入力が終わった」
 *   の判定には使えない。意味を変えると作り直しの保護が壊れるので、触らない。
 *
 * ★ "use client" のファイルに置かないこと。Server Component から読む。
 */

export type RosterKind = "enrolled" | "transfer" | "trial";

export type RosterEntry = {
  /** 画面と記録の鍵。在籍・振替は student_id、体験は trial の id */
  id: string;
  kind: RosterKind;
  name: string;
  kana: string | null;
};

export type AttendanceStatusValue = "present" | "absent" | "late" | "unconfirmed";

export type AttendanceProgress = {
  total: number;
  recorded: number;
};

export type ProgressState = "none" | "partial" | "done" | "empty";

const TRIAL_ATTENDABLE = ["booked", "attended", "no_show"] as const;

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

/** trials.status と出欠の値の対応 */
export function trialStatusToAttendance(status: string): AttendanceStatusValue {
  if (status === "attended") return "present";
  if (status === "no_show") return "absent";
  return "unconfirmed";
}
export function attendanceToTrialStatus(status: AttendanceStatusValue): string {
  if (status === "present" || status === "late") return "attended";
  if (status === "absent") return "no_show";
  return "booked";
}

const byKana = (a: RosterEntry, b: RosterEntry) =>
  (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja");

/** その回の名簿。在籍 → 振替 → 体験の順、それぞれふりがな順 */
export async function fetchRoster(
  supabase: SupabaseClient,
  organizationId: string,
  lesson: { id: string; class_id: string; date: string },
): Promise<RosterEntry[]> {
  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const [rEnrollments, rBookings, rTrials] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, start_date, end_date, students(name, name_kana)")
      .eq("class_id", lesson.class_id)
      .eq("organization_id", organizationId)
      .lte("start_date", lesson.date),
    supabase
      .from("transfer_bookings")
      .select("transfer_credits!inner(student_id, students(name, name_kana))")
      .eq("organization_id", organizationId)
      .eq("lesson_id", lesson.id)
      .is("canceled_at", null),
    supabase
      .from("trials")
      .select("id, student_name, student_name_kana, kind")
      .eq("organization_id", organizationId)
      .eq("lesson_id", lesson.id)
      .in("status", [...TRIAL_ATTENDABLE]),
  ]);

  // 失敗を黙って「0人」にしない。名簿が欠けると出欠が付けられないまま確定されてしまう
  for (const [label, r] of [["在籍", rEnrollments], ["振替", rBookings], ["体験", rTrials]] as const) {
    if (r.error) console.error(`名簿（${label}）の取得に失敗しました`, r.error);
  }
  const enrollments = rEnrollments.data;
  const bookings = rBookings.data;
  const trials = rTrials.data;

  type EnrollRow = {
    student_id: string;
    start_date: string;
    end_date: string | null;
    students: { name: string; name_kana: string | null } | null;
  };
  type BookingRow = {
    transfer_credits: {
      student_id: string;
      students: { name: string; name_kana: string | null } | null;
    } | null;
  };
  type TrialRow = {
    id: string;
    student_name: string;
    student_name_kana: string | null;
    kind: string;
  };

  const enrolled: RosterEntry[] = ((enrollments ?? []) as unknown as EnrollRow[])
    .filter((e) => enrolledOn(e, lesson.date))
    .map((e) => ({
      id: e.student_id,
      kind: "enrolled" as const,
      name: e.students?.name ?? "（生徒不明）",
      kana: e.students?.name_kana ?? null,
    }))
    .sort(byKana);
  const enrolledIds = new Set(enrolled.map((e) => e.id));

  // 在籍しているクラスの回に振替で来ることは無いはずだが、重なったら在籍を優先
  const transfers: RosterEntry[] = ((bookings ?? []) as unknown as BookingRow[])
    .map((b) => b.transfer_credits)
    .filter((c): c is NonNullable<BookingRow["transfer_credits"]> => c !== null)
    .filter((c) => !enrolledIds.has(c.student_id))
    .map((c) => ({
      id: c.student_id,
      kind: "transfer" as const,
      name: c.students?.name ?? "（生徒不明）",
      kana: c.students?.name_kana ?? null,
    }))
    .sort(byKana);

  const trialEntries: RosterEntry[] = ((trials ?? []) as TrialRow[])
    .map((t) => ({
      id: t.id,
      kind: "trial" as const,
      name: t.student_name,
      kana: t.student_name_kana,
    }))
    .sort(byKana);

  return [...enrolled, ...transfers, ...trialEntries];
}

/** 名簿の各行に入っている出欠（鍵は RosterEntry.id） */
export async function fetchRosterMarks(
  supabase: SupabaseClient,
  organizationId: string,
  lessonId: string,
  roster: RosterEntry[],
): Promise<Record<string, AttendanceStatusValue>> {
  const marks: Record<string, AttendanceStatusValue> = {};
  const trialIds = roster.filter((r) => r.kind === "trial").map((r) => r.id);

  const [{ data: attendances }, { data: trials }] = await Promise.all([
    supabase
      .from("attendances")
      .select("student_id, status")
      .eq("organization_id", organizationId)
      .eq("lesson_id", lessonId),
    trialIds.length > 0
      ? supabase
          .from("trials")
          .select("id, status")
          .eq("organization_id", organizationId)
          .in("id", trialIds)
      : Promise.resolve({ data: [] as { id: string; status: string }[] }),
  ]);

  for (const a of (attendances ?? []) as { student_id: string; status: AttendanceStatusValue }[]) {
    marks[a.student_id] = a.status;
  }
  for (const t of (trials ?? []) as { id: string; status: string }[]) {
    marks[t.id] = trialStatusToAttendance(t.status);
  }
  return marks;
}

/**
 * 複数レッスンぶんの進み具合をまとめて数える。
 * レッスン1件ごとに問い合わせると、1日ぶんでも回数が増えるため。
 * 名簿の数え方は fetchRoster と同じ（在籍＋振替＋体験）。
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

  const [rEnrollments, rAttendances, rBookings, rTrials] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("student_id, class_id, start_date, end_date")
        .eq("organization_id", organizationId)
        .in("class_id", classIds),
      supabase
        .from("attendances")
        .select("lesson_id, student_id, status")
        .eq("organization_id", organizationId)
        .in("lesson_id", lessonIds),
      supabase
        .from("transfer_bookings")
        .select("lesson_id, transfer_credits!inner(student_id)")
        .eq("organization_id", organizationId)
        .in("lesson_id", lessonIds)
        .is("canceled_at", null),
      supabase
        .from("trials")
        .select("lesson_id, status")
        .eq("organization_id", organizationId)
        .in("lesson_id", lessonIds)
        .in("status", [...TRIAL_ATTENDABLE]),
    ]);

  for (const [label, r] of [["在籍", rEnrollments], ["出欠", rAttendances], ["振替", rBookings], ["体験", rTrials]] as const) {
    if (r.error) console.error(`進み具合（${label}）の取得に失敗しました`, r.error);
  }
  const enrollments = rEnrollments.data;
  const attendances = rAttendances.data;
  const bookings = rBookings.data;
  const trials = rTrials.data;

  const enrollmentRows = (enrollments ?? []) as EnrollmentRow[];
  const attendanceRows = (attendances ?? []) as {
    lesson_id: string;
    student_id: string;
    status: string;
  }[];
  const bookingRows = (bookings ?? []) as unknown as {
    lesson_id: string;
    transfer_credits: { student_id: string } | null;
  }[];
  const trialRows = (trials ?? []) as { lesson_id: string; status: string }[];

  for (const l of lessons) {
    const students = new Set(
      enrollmentRows
        .filter((e) => e.class_id === l.class_id && enrolledOn(e, l.date))
        .map((e) => e.student_id),
    );
    for (const b of bookingRows) {
      if (b.lesson_id === l.id && b.transfer_credits) students.add(b.transfer_credits.student_id);
    }
    const lessonTrials = trialRows.filter((t) => t.lesson_id === l.id);

    const recordedStudents = attendanceRows.filter(
      (a) => a.lesson_id === l.id && a.status !== "unconfirmed" && students.has(a.student_id),
    ).length;
    const recordedTrials = lessonTrials.filter((t) => t.status !== "booked").length;

    result.set(l.id, {
      total: students.size + lessonTrials.length,
      recorded: recordedStudents + recordedTrials,
    });
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

/** その回に欠席連絡が来ている生徒の id */
export async function fetchAbsenceNotified(
  supabase: SupabaseClient,
  organizationId: string,
  lessonId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("absence_requests")
    .select("student_id")
    .eq("organization_id", organizationId)
    .eq("lesson_id", lessonId);
  return ((data ?? []) as { student_id: string }[]).map((a) => a.student_id);
}

/**
 * 「この回の出欠を確定する」
 *
 * まだ記録の無い人を、出席（欠席連絡があれば欠席）として保存する。
 * 既定を出席にしても「全員出席だった」と「誰も見ていない」を区別するため、
 * 確定という操作で行を作る（2026-10-14）。
 *
 * 在籍・振替は attendances に行を作る。体験は trials.status を attended にする
 * （record_trial_attendance() 経由。講師でも通るように関数に閉じてある）。
 *
 * 認可は呼び出し側（管理画面・講師画面それぞれのサーバーアクション）で
 * 済ませてから呼ぶこと。ここでは organization_id で絞るだけ。
 */
export async function confirmAttendanceRows(
  supabase: SupabaseClient,
  organizationId: string,
  lesson: { id: string; class_id: string; date: string },
  recordedBy: string,
): Promise<
  | { ok: true; saved: number; marks: Record<string, AttendanceStatusValue> }
  | { ok: false; error: string }
> {
  const roster = await fetchRoster(supabase, organizationId, lesson);
  const [marks, notified] = await Promise.all([
    fetchRosterMarks(supabase, organizationId, lesson.id, roster),
    fetchAbsenceNotified(supabase, organizationId, lesson.id),
  ]);
  const notifiedSet = new Set(notified);
  const now = new Date().toISOString();
  const missing = roster.filter((r) => (marks[r.id] ?? "unconfirmed") === "unconfirmed");

  const rows = missing
    .filter((r) => r.kind !== "trial")
    .map((r) => ({
      organization_id: organizationId,
      lesson_id: lesson.id,
      student_id: r.id,
      status: (notifiedSet.has(r.id) ? "absent" : "present") as AttendanceStatusValue,
      recorded_by: recordedBy,
      recorded_at: now,
    }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from("attendances")
      .upsert(rows, { onConflict: "lesson_id,student_id" });
    if (error) {
      console.error("出欠の確定に失敗しました", error);
      return { ok: false, error: "時間をおいてもう一度お試しください。" };
    }
    for (const r of rows) marks[r.student_id] = r.status;
  }

  let savedTrials = 0;
  for (const r of missing.filter((r) => r.kind === "trial")) {
    const { error } = await supabase.rpc("record_trial_attendance", {
      p_trial_id: r.id,
      p_status: "attended",
    });
    if (error) {
      console.error("体験の出欠の確定に失敗しました", error);
      return { ok: false, error: "体験の生徒の分を保存できませんでした。" };
    }
    marks[r.id] = "present";
    savedTrials += 1;
  }

  return { ok: true, saved: rows.length + savedTrials, marks };
}
