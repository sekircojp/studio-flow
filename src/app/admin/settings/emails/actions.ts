"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type TemplateState = { ok?: boolean; error?: string; message?: string };

/**
 * メール文面の保存（設計書 11章）
 *
 * ★ 差し込みの綴りは保存前に確かめる。
 *   {{生徒名}} を {{生徒の名前}} と書くと、送るときに黙って空になる。
 *   保護者に「　様」だけが届いてから気づくのでは遅い。
 *
 * ★ 件名も本文も空にはできない。
 *   件名が空のメールは迷惑メール扱いになりやすく、本文が空なら送る意味がない。
 *   既定に戻したいときは「既定の文面に戻す」を使う。
 */
export async function saveEmailTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { membership, userId } = await requireOwner();

  const kind = String(formData.get("kind") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!kind) return { error: "対象のメールが分かりませんでした。" };
  if (!subject) return { error: "件名を入力してください。" };
  if (!body) return { error: "本文を入力してください。" };

  const supabase = await createClient();

  const { data: def } = await supabase
    .from("email_template_defaults")
    .select("placeholders")
    .eq("kind", kind)
    .maybeSingle();

  if (!def) return { error: "対象のメールが分かりませんでした。" };

  // 使えない差し込みが書かれていないか確かめる
  const allowed = new Set<string>(def.placeholders ?? []);
  const used = [...`${subject}\n${body}`.matchAll(/\{\{([^}]+)\}\}/g)].map((m) =>
    m[1].trim(),
  );
  const unknown = [...new Set(used.filter((k) => !allowed.has(k)))];

  if (unknown.length > 0) {
    return {
      error: `使えない差し込みがあります: ${unknown
        .map((k) => `{{${k}}}`)
        .join(" ")}。下の一覧にあるものだけが使えます。`,
    };
  }

  const { error } = await supabase.from("email_templates").upsert(
    {
      organization_id: membership.organizationId,
      kind,
      subject,
      body,
      updated_by: userId,
    },
    { onConflict: "organization_id,kind" },
  );

  if (error) {
    console.error("メール文面の保存に失敗しました", error);
    return { error: "保存できませんでした。" };
  }

  revalidatePath("/admin/settings/emails");
  return { ok: true, message: "保存しました" };
}

/**
 * 既定の文面に戻す
 *
 * 行を消すだけ。スタジオの設定が無ければ既定の文面が使われる（移行 041）。
 */
export async function resetEmailTemplate(kind: string): Promise<TemplateState> {
  const { membership } = await requireOwner();

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("kind", kind);

  if (error) {
    console.error("メール文面の初期化に失敗しました", error);
    return { error: "戻せませんでした。" };
  }

  revalidatePath("/admin/settings/emails");
  return { ok: true, message: "既定の文面に戻しました" };
}

/**
 * 保存前の文面を、見本の値で差し込んで返す
 *
 * ★ 差し込みと描画は DB の関数に任せる。
 *   実際に送るときと同じ結果でないとプレビューの意味がない。画面側で
 *   もう一度実装すると、必ずどこかでずれる（移行 041）。
 */
export async function previewEmailTemplate(
  subject: string,
  body: string,
  vars: Record<string, string>,
): Promise<{ subject: string; body: string } | { error: string }> {
  await requireOwner();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_email", {
    p_subject: subject,
    p_body: body,
    p_vars: vars,
  });

  if (error) {
    console.error("プレビューの作成に失敗しました", error);
    return { error: "プレビューを作れませんでした。" };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { subject: string; body: string }
    | undefined;
  return row ?? { error: "プレビューを作れませんでした。" };
}
