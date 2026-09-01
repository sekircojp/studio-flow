import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { setInstructorActive } from "./actions";
import { InstructorForm } from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "講師" };

type Instructor = {
  id: string;
  name: string;
  name_kana: string | null;
  tel: string | null;
  email: string | null;
  is_active: boolean;
};

/**
 * 講師（設計書 4.7 のうち instructors のみ）
 *
 * 報酬計算（compensation_rules / monthly_compensations）は
 * フェーズ1では実装しない（設計書 9.1）。ここは名簿と担当割り当てのため。
 */
export default async function InstructorsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const { data } = await supabase
    .from("instructors")
    .select("id, name, name_kana, tel, email, is_active")
    .eq("organization_id", membership.organizationId)
    .order("created_at");

  const list = (data ?? []) as Instructor[];
  const active = list.filter((i) => i.is_active);
  const retired = list.filter((i) => !i.is_active);

  function Row({ i }: { i: Instructor }) {
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sf-ink">
            {i.name}
            {i.name_kana && (
              <span className="ml-2 text-[11px] text-sf-muted">
                {i.name_kana}
              </span>
            )}
          </p>
          {(i.tel || i.email) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-sf-muted">
              {i.tel && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3" aria-hidden />
                  {i.tel}
                </span>
              )}
              {i.email && (
                <span className="flex items-center gap-1 break-all">
                  <Mail className="size-3" aria-hidden />
                  {i.email}
                </span>
              )}
            </p>
          )}
        </div>
        <form
          action={async () => {
            "use server";
            await setInstructorActive(i.id, !i.is_active);
          }}
        >
          <button type="submit" className={secondaryButtonClass}>
            {i.is_active ? "退職にする" : "復帰させる"}
          </button>
        </form>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Team</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          講師
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          クラスの担当と、代講の記録に使います。退職しても記録が残るよう、
          削除ではなく状態の切り替えで表します。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Active" title="在籍中の講師" />
        <div className="mt-4">
          {active.length === 0 ? (
            <EmptyState
              title="講師がまだ登録されていません"
              description="クラスの担当講師を選べるようにするには、先に登録が必要です。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {active.map((i) => (
                <Row key={i.id} i={i} />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <InstructorForm />
          </div>
        </div>
      </Card>

      {retired.length > 0 && (
        <Card className="p-5">
          <SectionHeading
            kicker="Retired"
            title={`退職した講師（${retired.length}）`}
          />
          <ul className="mt-4 divide-y divide-sf-border rounded-xl border border-sf-border opacity-75">
            {retired.map((i) => (
              <Row key={i.id} i={i} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
