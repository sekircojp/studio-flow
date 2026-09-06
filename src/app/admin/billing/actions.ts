"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { monthStart } from "@/lib/billing";

export type BillingState = { ok?: boolean; error?: string; message?: string };

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function toInt(v: FormDataEntryValue | null): number | null {
  const s = orNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/** 料金プランの作成 */
export async function createPricingPlan(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership } = await requireAdmin();

  const name = orNull(formData.get("name"));
  const amount = toInt(formData.get("monthly_amount"));
  if (!name) return { error: "プラン名を入力してください。" };
  if (amount === null || amount < 0) {
    return { error: "月額は0以上の整数で入力してください（税込・円）。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_plans").insert({
    organization_id: membership.organizationId,
    name,
    monthly_amount: amount,
    enrollment_fee: toInt(formData.get("enrollment_fee")) ?? 0,
    annual_fee: toInt(formData.get("annual_fee")) ?? 0,
  });

  if (error) {
    console.error("料金プランの登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/billing/plans");
  return { ok: true };
}

/**
 * 生徒ごとの月謝を決める（DB 上は student_contracts）
 *
 * プランから金額を複写する。あとでプランの金額を変えても、登録済みの
 * 生徒の月謝が勝手に変わらないようにするため（設計書 4.5）。
 */
export async function createContract(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership } = await requireAdmin();
  const orgId = membership.organizationId;

  const studentId = orNull(formData.get("student_id"));
  const planId = orNull(formData.get("pricing_plan_id"));
  const startDate = orNull(formData.get("start_date"));
  if (!studentId) return { error: "生徒を選んでください。" };
  if (!startDate) return { error: "開始日を入力してください。" };

  const supabase = await createClient();

  let amount = toInt(formData.get("monthly_amount"));
  let taxRate = 0.1;

  if (planId) {
    const { data: plan } = await supabase
      .from("pricing_plans")
      .select("monthly_amount, tax_rate")
      .eq("id", planId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!plan) return { error: "そのプランは見つかりませんでした。" };
    if (amount === null) amount = plan.monthly_amount;
    taxRate = plan.tax_rate;
  }

  if (amount === null || amount < 0) {
    return { error: "月謝は0以上の整数で入力してください（税込・円）。" };
  }

  const { error } = await supabase.from("student_contracts").insert({
    organization_id: orgId,
    student_id: studentId,
    pricing_plan_id: planId,
    monthly_amount: amount,
    tax_rate: taxRate,
    payment_method: orNull(formData.get("payment_method")) ?? "cash",
    start_date: startDate,
  });

  if (error) {
    console.error("生徒の月謝の登録に失敗しました", error);
    if (error.code === "23505") {
      return { error: "この生徒の月謝は既に決まっています。" };
    }
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/billing");
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}

/**
 * 月次請求の生成（設計書 5.4）
 *
 * 実処理は DB 関数 generate_invoices()。兄弟割の判定が世帯単位で、
 * 明細の追加と合計の確定までを一度に行うため、途中の状態を残さない。
 */
export async function generateInvoices(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership } = await requireAdmin();

  const month = orNull(formData.get("month"));
  if (!month) return { error: "対象月が指定されていません。" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_invoices", {
    p_organization_id: membership.organizationId,
    p_billing_month: monthStart(month),
  });

  if (error) {
    console.error("請求の生成に失敗しました", error);
    return { error: "生成できませんでした。" };
  }

  const r = Array.isArray(data) ? data[0] : data;
  const parts = [`${r?.created ?? 0} 件を作成`];
  if (r?.skipped_existing) parts.push(`作成済み ${r.skipped_existing} 件はそのまま`);
  if (r?.discounted) parts.push(`兄弟割 ${r.discounted} 件`);

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return { ok: true, message: parts.join(" / ") };
}

/**
 * 入金の登録（設計書 6.3）
 *
 * 初期の主経路。現金・銀行振込を受け取った管理者がここに登録する。
 * 請求の状態は DB のトリガが入金合計から決める。アプリ側で持つと、
 * 入金を訂正したときに更新漏れが起きる。
 */
export async function recordPayment(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership, userId } = await requireAdmin();
  const orgId = membership.organizationId;

  const invoiceId = orNull(formData.get("invoice_id"));
  const amount = toInt(formData.get("amount"));
  if (!invoiceId) return { error: "請求が指定されていません。" };
  if (amount === null || amount <= 0) {
    return { error: "金額は1以上の整数で入力してください。" };
  }

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!invoice) return { error: "その請求は見つかりませんでした。" };

  // 取消済みの請求には入金を付けない（設計書 5.6）
  if (invoice.status === "canceled") {
    return { error: "取消済みの請求には入金を登録できません。" };
  }

  const { error } = await supabase.from("payments").insert({
    organization_id: orgId,
    invoice_id: invoiceId,
    method: orNull(formData.get("method")) ?? "cash",
    amount,
    paid_at: orNull(formData.get("paid_at"))
      ? new Date(`${orNull(formData.get("paid_at"))}T00:00:00+09:00`).toISOString()
      : new Date().toISOString(),
    recorded_by: userId,
    note: orNull(formData.get("note")),
  });

  if (error) {
    console.error("入金の登録に失敗しました", error);
    return { error: "登録できませんでした。" };
  }

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 請求の取消（設計書 5.6）
 *
 * 入金済みの請求は編集できない。取消＋返金記録で対応する。
 * 物理削除はしない。
 */
export async function cancelInvoice(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership } = await requireAdmin();

  const invoiceId = orNull(formData.get("invoice_id"));
  const reason = orNull(formData.get("cancel_reason"));
  if (!invoiceId) return { error: "請求が指定されていません。" };
  if (!reason) return { error: "取消の理由を入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", invoiceId)
    .eq("organization_id", membership.organizationId);

  if (error) {
    console.error("請求の取消に失敗しました", error);
    return { error: "取り消せませんでした。" };
  }

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 日にちは 1〜28 に収める。
 * 29〜31 にすると、2月や30日までの月で「その日が来ない」ことになり、
 * 請求が作られない月が生まれる。
 */
function clampDay(value: number | null, fallback: number): number {
  if (value === null) return fallback;
  return Math.min(Math.max(value, 1), 28);
}

/** 対象月のずらし幅。-1 前月に作る / 0 当月 / +1 翌月 */
function clampOffset(value: number | null): number {
  if (value === null) return 0;
  return Math.min(Math.max(value, -1), 1);
}

/** 請求日・兄弟割・支払期限の設定（オーナーのみ） */
export async function saveBillingSettings(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { membership } = await requireOwner();

  const rate = Number(orNull(formData.get("sibling_discount_rate")) ?? "0");
  const supabase = await createClient();

  const { error } = await supabase.from("billing_settings").upsert(
    {
      organization_id: membership.organizationId,
      sibling_discount_enabled: formData.get("sibling_discount_enabled") === "on",
      sibling_discount_target:
        orNull(formData.get("sibling_discount_target")) ?? "second_and_beyond",
      sibling_discount_type:
        orNull(formData.get("sibling_discount_type")) ?? "fixed",
      sibling_discount_amount: toInt(formData.get("sibling_discount_amount")) ?? 0,
      sibling_discount_rate: Number.isFinite(rate) ? Math.min(Math.max(rate / 100, 0), 1) : 0,
      count_suspended_in_siblings:
        formData.get("count_suspended_in_siblings") === "on",
      issue_month_offset: clampOffset(
        toInt(formData.get("issue_month_offset")),
      ),
      issue_day: clampDay(toInt(formData.get("issue_day")), 1),
      issue_on_month_end: formData.get("issue_on_month_end") === "on",
      due_day: clampDay(toInt(formData.get("due_day")), 27),
      due_on_month_end: formData.get("due_on_month_end") === "on",
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("請求設定の保存に失敗しました", error);
    return { error: "保存できませんでした。" };
  }

  revalidatePath("/admin/billing/settings");
  return { ok: true };
}
