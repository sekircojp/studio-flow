import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, STUDENT_STATUSES, statusLabel, statusTone } from "@/lib/students";
import { StudentForm } from "./forms";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

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

const TONE_CLASS: Record<string, string> = {
  ok: "bg-sf-ok/12 text-sf-ok",
  info: "bg-sf-accent/12 text-sf-accent",
  warn: "bg-sf-warn/14 text-sf-warn",
  muted: "bg-sf-ink/8 text-sf-muted",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        TONE_CLASS[statusTone(status)]
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * 生徒・保護者（設計書 4.3）
 *
 * 在籍状態は5つ。休会を2種類持つのが要点で、休会費を設定した場合は
 * 請求が発生するため、請求ありと請求停止を混ぜると件数が合わなくなる。
 */
export default async function StudentsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: students }, { data: households }, { data: guardians }] =
    await Promise.all([
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
    ]);

  const studentList = (students ?? []) as Student[];
  const householdList = (households ?? []) as { id: string; name: string }[];
  const guardianList = (guardians ?? []) as {
    id: string;
    name: string;
    household_id: string;
  }[];

  const counts = STUDENT_STATUSES.map((s) => ({
    ...s,
    count: studentList.filter((x) => x.status === s.value).length,
  }));

  return (
    <div className="space-y-6">
      <div className="pb-1">
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
        {counts.map((c) => (
          <div
            key={c.value}
            className="rounded-xl border border-sf-border bg-sf-card px-3 py-2"
          >
            <p className="text-[11px] text-sf-muted">{c.label}</p>
            <p className="sf-num text-lg font-bold text-sf-ink">{c.count}</p>
          </div>
        ))}
      </div>

      <Card className="p-5">
        <SectionHeading
          kicker="Students"
          title={`生徒（${studentList.length}）`}
        />
        <div className="mt-4">
          {studentList.length === 0 ? (
            <EmptyState
              title="生徒がまだ登録されていません"
              description="下の「生徒を登録」から追加してください。新しい家族なら、世帯と保護者も同時に作られます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {studentList.map((s) => {
                const household = householdList.find(
                  (h) => h.id === s.household_id,
                );
                const familyGuardians = guardianList.filter(
                  (g) => g.household_id === s.household_id,
                );
                const age = ageFrom(s.birth_date);

                return (
                  <li key={s.id}>
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-sf-bg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sf-ink">
                            {s.name}
                          </span>
                          {s.name_kana && (
                            <span className="text-[11px] text-sf-muted">
                              {s.name_kana}
                            </span>
                          )}
                          <StatusBadge status={s.status} />
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-sf-muted">
                          {age !== null && <span>{age}歳</span>}
                          {s.grade && <span>{s.grade}</span>}
                          {household && (
                            <span className="flex items-center gap-1">
                              <Users className="size-3" aria-hidden />
                              {household.name}
                            </span>
                          )}
                          {familyGuardians.length > 0 && (
                            <span>
                              保護者 {familyGuardians.map((g) => g.name).join("・")}
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight
                        className="size-4 shrink-0 text-sf-muted"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <StudentForm households={householdList} />
          </div>
        </div>
      </Card>
    </div>
  );
}
