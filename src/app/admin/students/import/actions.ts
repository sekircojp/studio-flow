"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { buildPreview, parseCsv, type ImportRow } from "@/lib/csv";

export type ImportState = {
  ok?: boolean;
  error?: string;
  message?: string;
  preview?: {
    rows: ImportRow[];
    issues: { line: number; message: string }[];
    fixes: { line: number; message: string }[];
    households: number;
  };
};

/**
 * 取り込みの確認（設計書 4.3）
 *
 * ここでは1件も書き込まない。何が入るかと、直すべき行を見せるだけ。
 * クラス名の照合があるので、検証はサーバーで行う。
 */
export async function previewImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { membership } = await requireAdmin();

  const text = formData.get("csv");
  if (typeof text !== "string" || text.trim() === "") {
    return { error: "CSV を選んでください。" };
  }

  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("name")
    .eq("organization_id", membership.organizationId);

  const preview = buildPreview(
    parseCsv(text),
    (classes ?? []).map((c) => c.name as string),
  );

  return { preview };
}

/**
 * 取り込みの実行
 *
 * 実処理は DB 関数 import_students()。世帯・保護者・生徒・在籍・月謝を
 * 同じトランザクションで作る。200行のうち137行目で落ちて「136人だけ
 * 入っている」状態が残ると、どこから再開すればよいか分からなくなる。
 *
 * 検証はここでもう一度やり直す。確認の画面を経ずに実行だけを叩かれても
 * 通らないようにするため（設計書 7章）。
 */
export async function runImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { membership } = await requireAdmin();

  const text = formData.get("csv");
  if (typeof text !== "string" || text.trim() === "") {
    return { error: "CSV を選んでください。" };
  }

  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("name")
    .eq("organization_id", membership.organizationId);

  const preview = buildPreview(
    parseCsv(text),
    (classes ?? []).map((c) => c.name as string),
  );

  if (preview.issues.length > 0) {
    return {
      error: "直すところが残っています。確認してからもう一度実行してください。",
      preview,
    };
  }
  if (preview.rows.length === 0) {
    return { error: "取り込む行がありません。", preview };
  }

  const { data, error } = await supabase.rpc("import_students", {
    p_organization_id: membership.organizationId,
    p_rows: preview.rows,
  });

  if (error) {
    console.error("生徒の取り込みに失敗しました", error);
    // クラス名の取り違えは起きやすいので、原因をそのまま見せる
    if (error.message?.includes("class_not_found")) {
      return {
        error: `クラスが見つかりませんでした（${error.message.split(": ").at(-1)}）。`,
        preview,
      };
    }
    return { error: "取り込めませんでした。1件も登録していません。", preview };
  }

  const r = Array.isArray(data) ? data[0] : data;
  const parts = [
    `生徒 ${r?.students_created ?? 0} 名`,
    `世帯 ${r?.households_created ?? 0}`,
    `保護者 ${r?.guardians_created ?? 0} 名`,
  ];
  if (r?.enrollments_created) parts.push(`在籍 ${r.enrollments_created} 件`);
  if (r?.contracts_created) parts.push(`月謝 ${r.contracts_created} 件`);

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return { ok: true, message: parts.join(" / ") + " を取り込みました。" };
}
