import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Ruler, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa } from "@/lib/date";
import { ageFrom, STUDENT_STATUSES } from "@/lib/students";
import { setStudentStatus } from "../actions";
import { StatusBadge } from "../page";
import { GuardianForm, MeasurementForm } from "./forms";
import { Card, EmptyState, SectionHeading, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = { title: "生徒" };

/**
 * 生徒の詳細
 *
 * 同じ世帯の保護者と、採寸履歴を出す。
 * 採寸は履歴形式で、最新値を生徒の属性として持たない（設計書 4.3）。
 */
export default async function StudentDetailPage({
  params,
}: PageProps<"/admin/students/[id]">) {
  const { id } = await params;
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, name, name_kana, birth_date, gender, grade, enrolled_on, status, note, household_id",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!student) notFound();

  const [{ data: household }, { data: guardians }, { data: siblings }, { data: measurements }] =
    await Promise.all([
      supabase
        .from("households")
        .select("id, name, billing_guardian_id")
        .eq("id", student.household_id)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("guardians")
        .select("id, name, name_kana, relationship, email, tel, emergency_contact")
        .eq("household_id", student.household_id)
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("students")
        .select("id, name, status")
        .eq("household_id", student.household_id)
        .eq("organization_id", orgId)
        .neq("id", id)
        .order("created_at"),
      supabase
        .from("student_measurements")
        .select("id, measured_at, height, wear_size, shoe_size, note")
        .eq("student_id", id)
        .eq("organization_id", orgId)
        .order("measured_at", { ascending: false }),
    ]);

  const guardianList = guardians ?? [];
  const siblingList = siblings ?? [];
  const measurementList = measurements ?? [];
  const age = ageFrom(student.birth_date);

  const facts: [string, string | null][] = [
    ["ふりがな", student.name_kana],
    ["生年月日", student.birth_date ? formatDateJa(student.birth_date) : null],
    ["年齢", age !== null ? `${age}歳` : null],
    ["学年", student.grade],
    ["性別", student.gender],
    ["入会日", student.enrolled_on ? formatDateJa(student.enrolled_on) : null],
    ["メモ", student.note],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          生徒一覧
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight text-sf-ink">
          {student.name}
          <StatusBadge status={student.status} />
        </h1>
        {household && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-sf-body">
            <Users className="size-3.5 text-sf-muted" aria-hidden />
            {household.name}
            {siblingList.length > 0 && (
              <span className="text-sf-muted">
                （兄弟：
                {siblingList.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && "・"}
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="underline"
                    >
                      {s.name}
                    </Link>
                  </span>
                ))}
                ）
              </span>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <SectionHeading kicker="Profile" title="基本情報" />
          <dl className="mt-4 divide-y divide-sf-border rounded-xl border border-sf-border text-[13px]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-4 px-4 py-2.5">
                <dt className="w-24 shrink-0 text-sf-muted">{label}</dt>
                <dd className="min-w-0 break-words text-sf-ink">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <SectionHeading kicker="Status" title="在籍状態" />
          <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
            退会しても記録は消しません。休会は請求ありと請求停止の2種類あり、
            混ぜると請求件数と合わなくなります。
          </p>
          <ul className="mt-4 space-y-2">
            {STUDENT_STATUSES.map((s) => (
              <li key={s.value}>
                <form
                  action={async () => {
                    "use server";
                    await setStudentStatus(id, s.value);
                  }}
                >
                  <button
                    type="submit"
                    disabled={s.value === student.status}
                    className={`w-full justify-start ${secondaryButtonClass} ${
                      s.value === student.status
                        ? "border-sf-accent bg-sf-accent/5 text-sf-ink"
                        : ""
                    }`}
                  >
                    {s.value === student.status ? "● " : "○ "}
                    {s.label}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <SectionHeading
          kicker="Guardians"
          title={`保護者（${guardianList.length}）`}
        />
        <div className="mt-4">
          {guardianList.length === 0 ? (
            <EmptyState
              title="保護者が登録されていません"
              description="連絡先が無いと、休講の連絡や請求の案内が届きません。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {guardianList.map((g) => (
                <li key={g.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sf-ink">{g.name}</span>
                    {g.relationship && (
                      <span className="text-[11px] text-sf-muted">
                        {g.relationship}
                      </span>
                    )}
                    {household?.billing_guardian_id === g.id && (
                      <span className="rounded-md bg-sf-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-sf-accent">
                        請求の宛先
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sf-muted">
                    {g.tel && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" aria-hidden />
                        {g.tel}
                      </span>
                    )}
                    {g.email && (
                      <span className="flex items-center gap-1 break-all">
                        <Mail className="size-3" aria-hidden />
                        {g.email}
                      </span>
                    )}
                    {g.emergency_contact && (
                      <span>緊急: {g.emergency_contact}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <GuardianForm householdId={student.household_id} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading
          kicker="Measurements"
          title={`採寸履歴（${measurementList.length}）`}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          最新の値で上書きせず、測った日ごとに残します。子どもは成長するため、
          いつ時点の数値かが分からないと衣装の発注に使えません。
        </p>
        <div className="mt-4">
          {measurementList.length === 0 ? (
            <EmptyState
              title="採寸の記録がありません"
              description="発表会や衣装の準備で使います。今は記録だけを残せます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {measurementList.map((m, i) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[13px]"
                >
                  <span className="sf-num flex w-40 shrink-0 items-center gap-1.5 text-sf-ink">
                    <Ruler className="size-3.5 text-sf-muted" aria-hidden />
                    {formatDateJa(m.measured_at)}
                  </span>
                  {i === 0 && (
                    <span className="rounded-md bg-sf-ok/12 px-1.5 py-0.5 text-[11px] font-medium text-sf-ok">
                      最新
                    </span>
                  )}
                  {m.height && <span className="sf-num">身長 {m.height}cm</span>}
                  {m.wear_size && <span>ウェア {m.wear_size}</span>}
                  {m.shoe_size && (
                    <span className="sf-num">靴 {m.shoe_size}cm</span>
                  )}
                  {m.note && (
                    <span className="text-sf-muted">{m.note}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <MeasurementForm studentId={id} />
          </div>
        </div>
      </Card>
    </div>
  );
}
