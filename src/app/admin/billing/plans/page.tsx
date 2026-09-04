import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatYen, todayInTokyo } from "@/lib/date";
import { paymentMethodLabel } from "@/lib/billing";
import { ContractForm, PlanForm } from "./forms";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "料金プランと月謝" };

/**
 * 料金プランと、生徒ごとの月謝（設計書 4.5）
 *
 * プラン → 生徒の月謝 → 請求 → 入金 を別のものとして分けている。
 * DB では student_contracts（月謝契約）という名前だが、画面では
 * 「生徒ごとの月謝」と呼ぶ。小規模スタジオで書面を交わすわけではないので、
 * 「契約」は運営者の言葉づかいから離れている。
 */
export default async function PlansPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  const [{ data: plans }, { data: contracts }, { data: students }] =
    await Promise.all([
      supabase
        .from("pricing_plans")
        .select("id, name, monthly_amount, enrollment_fee, annual_fee, is_active")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("student_contracts")
        .select(
          "id, student_id, monthly_amount, payment_method, start_date, status, students(name)",
        )
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("students")
        .select("id, name")
        .eq("organization_id", orgId)
        .neq("status", "withdrawn")
        .order("created_at"),
    ]);

  type ContractRow = {
    id: string;
    student_id: string;
    monthly_amount: number;
    payment_method: string;
    start_date: string;
    status: string;
    students: { name: string } | null;
  };

  const planList = (plans ?? []) as {
    id: string;
    name: string;
    monthly_amount: number;
    enrollment_fee: number;
    annual_fee: number;
    is_active: boolean;
  }[];
  const contractList = (contracts ?? []) as unknown as ContractRow[];
  const studentList = (students ?? []) as { id: string; name: string }[];

  // 月謝が決まっている生徒は候補から外す（二重に作られるのを防ぐ）
  const contracted = new Set(
    contractList.filter((c) => c.status !== "ended").map((c) => c.student_id),
  );
  const selectableStudents = studentList.filter((s) => !contracted.has(s.id));

  const STATUS_LABEL: Record<string, string> = {
    active: "有効",
    suspended_billed: "休会（請求あり）",
    suspended_unbilled: "休会（請求停止）",
    ended: "終了",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          月謝・請求
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          料金プランと月謝
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          生徒の月謝はプランから金額を写し取ります。あとでプランの金額を変えても、
          登録済みの生徒の月謝は変わりません。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Plans" title={`料金プラン（${planList.length}）`} />
        <div className="mt-4">
          {planList.length === 0 ? (
            <EmptyState
              title="料金プランがありません"
              description="よく使う金額をプランにしておくと、生徒の月謝を決めるときに選ぶだけで済みます。プランを使わず個別の金額だけで運用することもできます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {planList.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="min-w-0 flex-1 font-medium text-sf-ink">
                    {p.name}
                  </span>
                  <span className="sf-num text-[13px] text-sf-ink">
                    {formatYen(p.monthly_amount)}
                    <span className="ml-1 text-[11px] text-sf-muted">/ 月</span>
                  </span>
                  {(p.enrollment_fee > 0 || p.annual_fee > 0) && (
                    <span className="sf-num text-[11px] text-sf-muted">
                      入会金 {formatYen(p.enrollment_fee)} ・ 年会費{" "}
                      {formatYen(p.annual_fee)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <PlanForm />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading
          kicker="Monthly fees"
          title={`生徒ごとの月謝（${contractList.filter((c) => c.status !== "ended").length}）`}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          請求は「有効」と「休会（請求あり）」の生徒に対して作られます。
          「休会（請求停止）」には作られません。生徒名を押すと詳細に移動します。
        </p>
        <div className="mt-4">
          {contractList.length === 0 ? (
            <EmptyState
              title="月謝が決まっている生徒がいません"
              description="月謝が決まっていない生徒には請求が作られません。生徒ごとに1件ずつ設定します。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {contractList.map((c) => (
                <li
                  key={c.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                    c.status === "ended" ? "opacity-60" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/admin/students/${c.student_id}`}
                      className="block font-medium text-sf-ink underline decoration-sf-border underline-offset-4 hover:decoration-sf-accent"
                    >
                      {c.students?.name ?? "（生徒不明）"}
                    </Link>
                    <span className="sf-num block text-[12px] text-sf-muted">
                      {formatDateJa(c.start_date)} 〜 ・{" "}
                      {paymentMethodLabel(c.payment_method)} ・{" "}
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </span>
                  <span className="sf-num text-[15px] font-bold text-sf-ink">
                    {formatYen(c.monthly_amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <ContractForm
              students={selectableStudents}
              plans={planList.filter((p) => p.is_active)}
              today={todayInTokyo()}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
