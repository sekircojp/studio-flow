import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, Inbox, Search, Sparkles, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, STUDENT_STATUSES, statusLabel, statusTone } from "@/lib/students";
import { todayInTokyo } from "@/lib/date";
import { AddStudentPanel } from "./forms";
import {
  Card,
  DataTable,
  EmptyState,
  Pill,
  SectionHeading,
  secondaryButtonClass,
  Td,
  Th,
  type PillTone,
} from "@/components/ui";

export const metadata: Metadata = { title: "生徒・保護者" };

type Student = {
  id: string;
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  grade: string | null;
  status: string;
  household_id: string;
};

export function StatusBadge({ status }: { status: string }) {
  return <Pill tone={statusTone(status) as PillTone}>{statusLabel(status)}</Pill>;
}

/**
 * 生徒・保護者（設計書 4.3）
 *
 * 在籍状態は5つ。休会を2種類持つのが要点で、休会費を設定した場合は
 * 請求が発生するため、請求ありと請求停止を混ぜると件数が合わなくなる。
 */
export default async function StudentsPage({
  searchParams,
}: PageProps<"/admin/students">) {
  const { membership } = await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();
  const orgId = membership.organizationId;

  /**
   * 絞り込み（URL に持つ。詳細から戻っても条件が残る）
   *   q=      名前・ふりがな
   *   status= 在籍状態
   *   class=  所属クラス（今日時点で在籍）
   */
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusFilter =
    typeof params.status === "string" &&
    STUDENT_STATUSES.some((s) => s.value === params.status)
      ? params.status
      : "";
  const classFilter = typeof params.class === "string" ? params.class : "";
  const filtering = q !== "" || statusFilter !== "" || classFilter !== "";
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (statusFilter) query.set("status", statusFilter);
  if (classFilter) query.set("class", classFilter);
  const back = query.toString();
  const withParams = (changes: Record<string, string>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/admin/students${s ? `?${s}` : ""}`;
  };

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    { data: students },
    { data: households },
    { data: guardians },
    { data: classes },
    { data: enrollments },
  ] = await Promise.all([
      supabase
        .from("students")
        .select("id, name, name_kana, birth_date, grade, status, household_id")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("households")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("guardians")
        .select("id, name, household_id")
        .eq("organization_id", orgId),
      supabase
        .from("classes")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("enrollments")
        .select("student_id, class_id, start_date, end_date")
        .eq("organization_id", orgId),
    ]);

  const today = todayInTokyo();
  const classList = (classes ?? []) as { id: string; name: string }[];
  const enrollmentList = (enrollments ?? []) as {
    student_id: string;
    class_id: string;
    start_date: string;
    end_date: string | null;
  }[];
  const inClassToday = (studentId: string, classId: string) =>
    enrollmentList.some(
      (e) =>
        e.student_id === studentId &&
        e.class_id === classId &&
        e.start_date <= today &&
        (e.end_date === null || e.end_date >= today),
    );

  const allStudents = (students ?? []) as Student[];
  const studentList = allStudents.filter(
    (s) =>
      (q === "" || s.name.includes(q) || (s.name_kana ?? "").includes(q)) &&
      (statusFilter === "" || s.status === statusFilter) &&
      (classFilter === "" || inClassToday(s.id, classFilter)),
  );
  const householdList = (households ?? []) as { id: string; name: string }[];
  const guardianList = (guardians ?? []) as {
    id: string;
    name: string;
    household_id: string;
  }[];

  // 状態ごとの人数は、絞り込む前の全体で数える（押すと絞り込みになる）
  const counts = STUDENT_STATUSES.map((s) => ({
    ...s,
    count: allStudents.filter((x) => x.status === s.value).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
        <div>
          <p className="sf-kicker">Members</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
            生徒・保護者
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
            生徒は必ず世帯に属します。世帯は兄弟割の判定単位なので、兄弟は同じ世帯に
            入れてください。退会しても記録は消さず、状態の変更で表します。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/students/trials" className={secondaryButtonClass}>
            <Sparkles className="size-3.5" aria-hidden />
            体験・見学
          </Link>
          <Link
            href="/admin/students/applications"
            className={secondaryButtonClass}
          >
            <Inbox className="size-3.5" aria-hidden />
            入会申込
          </Link>
          <Link href="/admin/students/import" className={secondaryButtonClass}>
            <FileUp className="size-3.5" aria-hidden />
            CSV から取り込む
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {counts.map((c) => {
          const on = statusFilter === c.value;
          return (
            <Link
              key={c.value}
              href={withParams({ status: on ? "" : c.value })}
              aria-pressed={on}
              className={`rounded-xl border px-3 py-2 transition ${
                on
                  ? "border-sf-accent bg-sf-accent/8"
                  : "border-sf-border bg-sf-card hover:border-sf-border-strong"
              }`}
            >
              <p className="text-[12px] text-sf-muted">{c.label}</p>
              <p className="sf-num text-lg font-bold text-sf-ink">{c.count}</p>
            </Link>
          );
        })}
      </div>

      <AddStudentPanel households={householdList} />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title={
              filtering
                ? `生徒（${studentList.length} / ${allStudents.length}）`
                : `生徒（${allStudents.length}）`
            }
          />
          <form method="get" action="/admin/students" className="flex flex-wrap items-center gap-2">
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <label htmlFor="students-q" className="sr-only">名前・ふりがなで探す</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sf-muted" aria-hidden />
              <input
                id="students-q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="名前・ふりがな"
                className="w-48 rounded-lg border border-sf-border-strong/90 bg-white py-1.5 pl-8 pr-2 text-[13px] text-sf-ink outline-none transition focus:border-sf-accent focus:ring-4 focus:ring-sf-accent/15"
              />
            </div>
            {classList.length > 0 && (
              <>
                <label htmlFor="students-class" className="sr-only">クラスで絞る</label>
                <select
                  id="students-class"
                  name="class"
                  defaultValue={classFilter}
                  className="rounded-lg border border-sf-border-strong/90 bg-white py-1.5 pl-2 pr-7 text-[13px] text-sf-ink outline-none transition focus:border-sf-accent focus:ring-4 focus:ring-sf-accent/15"
                >
                  <option value="">すべてのクラス</option>
                  {classList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}
            <button type="submit" className={secondaryButtonClass}>絞り込む</button>
          </form>
        </div>
        {filtering && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-sf-body">
            絞り込み中:
            {q && (
              <Link href={withParams({ q: "" })} className="inline-flex items-center gap-1 rounded-md bg-sf-ink/6 px-2 py-0.5 text-sf-ink hover:bg-sf-ink/10">
                「{q}」<X className="size-3" aria-hidden />
              </Link>
            )}
            {statusFilter && (
              <Link href={withParams({ status: "" })} className="inline-flex items-center gap-1 rounded-md bg-sf-ink/6 px-2 py-0.5 text-sf-ink hover:bg-sf-ink/10">
                {statusLabel(statusFilter)}<X className="size-3" aria-hidden />
              </Link>
            )}
            {classFilter && (
              <Link href={withParams({ class: "" })} className="inline-flex items-center gap-1 rounded-md bg-sf-ink/6 px-2 py-0.5 text-sf-ink hover:bg-sf-ink/10">
                {classList.find((c) => c.id === classFilter)?.name ?? "クラス"}<X className="size-3" aria-hidden />
              </Link>
            )}
            <Link href="/admin/students" className="underline">すべて解除</Link>
          </p>
        )}
        <div className="mt-4">
          {studentList.length === 0 ? (
            filtering ? (
              <EmptyState
                title="条件に合う生徒がいません"
                description="絞り込みを外すと、すべての生徒が並びます。"
              />
            ) : (
              <EmptyState
                title="生徒がまだ登録されていません"
                description="上の「生徒を追加」から登録してください。新しい家族なら、世帯と保護者も同時に作られます。"
              />
            )
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>生徒</Th>
                  <Th>状態</Th>
                  <Th>年齢・学年</Th>
                  <Th>世帯</Th>
                  <Th>保護者</Th>
                  <Th>
                    <span className="sr-only">開く</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {studentList.map((s) => {
                  const household = householdList.find((h) => h.id === s.household_id);
                  const familyGuardians = guardianList.filter(
                    (g) => g.household_id === s.household_id,
                  );
                  const age = ageFrom(s.birth_date);
                  const href = `/admin/students/${s.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`;

                  return (
                    <tr key={s.id}>
                      <Td>
                        <Link href={href} className="block hover:underline">
                          <span className="block text-[14px] font-semibold text-sf-ink">{s.name}</span>
                          {s.name_kana && (
                            <span className="block text-[12px] text-sf-muted">{s.name_kana}</span>
                          )}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge status={s.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-sf-body">
                        {age !== null ? `${age}歳` : "—"}
                        {s.grade && <span className="ml-1.5">{s.grade}</span>}
                      </Td>
                      <Td className="text-sf-body">{household?.name ?? "—"}</Td>
                      <Td className="text-sf-body">
                        {familyGuardians.length > 0
                          ? familyGuardians.map((g) => g.name).join("・")
                          : "—"}
                      </Td>
                      <Td align="right">
                        <Link
                          href={href}
                          aria-label={`${s.name} を開く`}
                          className="inline-flex size-8 items-center justify-center rounded-full text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>
      </Card>
    </div>
  );
}
