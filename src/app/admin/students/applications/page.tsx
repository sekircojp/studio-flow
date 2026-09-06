import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { ApproveButton, DeclineButton } from "./forms";

export const metadata: Metadata = { title: "入会申込" };

type ApplicationRow = {
  id: string;
  student_name: string;
  student_name_kana: string | null;
  birth_date: string | null;
  grade: string | null;
  guardian_name: string;
  relationship: string | null;
  email: string;
  tel: string | null;
  address: string | null;
  note: string | null;
  status: string;
  created_at: string;
  decline_reason: string | null;
  classes: { name: string } | null;
};

/**
 * 入会申込の確認（設計書 4.6）
 *
 * 公開ページから届いた申込を、オーナー・スタッフが見て承認する。
 * 承認すると世帯・保護者・生徒ができ、申込のメールアドレスが保護者に入る。
 * 保護者が同じアドレスでログインすると、自分の子どもに結びつく。
 */
export default async function ApplicationsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  // RLS でも絞られるが、アプリ層でも organization_id で絞る（設計書 3章）
  const { data, error } = await supabase
    .from("enrollment_applications")
    .select(
      "id, student_name, student_name_kana, birth_date, grade, guardian_name, relationship, email, tel, address, note, status, created_at, decline_reason, classes(name)",
    )
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  // 黙って空の一覧を出すと、届いた申込を見落とす
  if (error) console.error("入会申込の取得に失敗しました", error);

  const list = (data ?? []) as unknown as ApplicationRow[];
  const pending = list.filter((a) => a.status === "pending");
  const done = list.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          生徒・保護者
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          入会申込
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          公開ページから届いた申込です。承認すると生徒として登録され、
          申込のメールアドレスで保護者がマイページに入れるようになります。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Pending" title={`未対応（${pending.length}）`} />
        <div className="mt-4">
          {pending.length === 0 ? (
            <EmptyState
              title="未対応の申込はありません"
              description="公開ページのURLを案内すると、ここに申込が届きます。"
            />
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => (
                <li key={a.id} className="rounded-xl border border-sf-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sf-ink">
                        {a.student_name}
                        {a.student_name_kana && (
                          <span className="ml-2 text-[12px] font-normal text-sf-muted">
                            {a.student_name_kana}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12px] text-sf-muted">
                        {a.birth_date && `${formatDateJa(a.birth_date)}生 ・ `}
                        {a.grade && `${a.grade} ・ `}
                        希望クラス {a.classes?.name ?? "相談したい"}
                      </p>
                    </div>
                    <span className="sf-num text-[11px] text-sf-muted">
                      {formatDateJa(a.created_at)} 受付
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg bg-sf-bg p-3 text-[12px] text-sf-body">
                    <p className="font-medium text-sf-ink">
                      {a.guardian_name}
                      {a.relationship && `（${a.relationship}）`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Mail className="size-3.5 text-sf-muted" aria-hidden />
                        {a.email}
                      </span>
                      {a.tel && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5 text-sf-muted" aria-hidden />
                          {a.tel}
                        </span>
                      )}
                    </p>
                    {a.address && <p className="mt-1">{a.address}</p>}
                  </div>

                  {a.note && (
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-sf-body">
                      {a.note}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-sf-border pt-3">
                    <ApproveButton applicationId={a.id} />
                    <DeclineButton applicationId={a.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {done.length > 0 && (
        <Card className="p-5">
          <SectionHeading kicker="Done" title={`対応済み（${done.length}）`} />
          <ul className="mt-4 divide-y divide-sf-border rounded-xl border border-sf-border">
            {done.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sf-ink">
                    {a.student_name}
                  </span>
                  <span className="block text-[12px] text-sf-muted">
                    {a.guardian_name} ・ {a.email}
                    {a.decline_reason && ` ・ ${a.decline_reason}`}
                  </span>
                </span>
                <span
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    a.status === "approved"
                      ? "bg-sf-ok/12 text-sf-ok"
                      : "bg-sf-ink/8 text-sf-muted"
                  }`}
                >
                  {a.status === "approved" ? "承認済" : "見送り"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
