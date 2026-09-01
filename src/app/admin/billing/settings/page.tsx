import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { BillingSettingsForm } from "./form";
import { Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "請求の設定" };

export type BillingSettings = {
  sibling_discount_enabled: boolean;
  sibling_discount_target: string;
  sibling_discount_type: string;
  sibling_discount_amount: number;
  sibling_discount_rate: number;
  count_suspended_in_siblings: boolean;
  due_day: number;
};

const DEFAULTS: BillingSettings = {
  sibling_discount_enabled: false,
  sibling_discount_target: "second_and_beyond",
  sibling_discount_type: "fixed",
  sibling_discount_amount: 0,
  sibling_discount_rate: 0,
  count_suspended_in_siblings: true,
  due_day: 27,
};

/**
 * 請求の設定（設計書 5.5）
 *
 * 兄弟割はルールエンジンではなく、決まった数個の設定値で表す。
 */
export default async function BillingSettingsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("billing_settings")
    .select(
      "sibling_discount_enabled, sibling_discount_target, sibling_discount_type, sibling_discount_amount, sibling_discount_rate, count_suspended_in_siblings, due_day",
    )
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  const settings = (data ?? DEFAULTS) as BillingSettings;
  const isOwner = membership.role === "owner";

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
          請求の設定
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          兄弟割と支払期限を決めます。請求を作るときに、この設定が使われます。
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <SectionHeading kicker="Billing" title="兄弟割と支払期限" />
        <div className="mt-5">
          {isOwner ? (
            <BillingSettingsForm settings={settings} />
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-sf-warn/10 px-3 py-2.5 text-[13px] text-sf-ink">
              <Lock className="size-4 shrink-0 text-sf-warn" aria-hidden />
              請求の設定を変更できるのはオーナーのみです。
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
