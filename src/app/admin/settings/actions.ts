"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; error?: string };

/** 空文字は null にする。未入力と空文字を DB 上で区別しないため */
function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * 基本設定の保存
 *
 * 設計書 7章のとおり、画面の出し分けとは別に、ここでも必ず認可する。
 * requireOwner() は /admin へリダイレクトするため、スタッフが直接
 * このアクションを叩いても更新できない。
 */
export async function saveBrandSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { membership } = await requireOwner();
  const orgId = membership.organizationId;

  const studioName = orNull(formData.get("studio_name"));
  const email = orNull(formData.get("email"));
  const brandColor = orNull(formData.get("brand_color"));

  // 画面側の required だけに頼らない。直接叩かれても空では保存させない
  if (!studioName) return { error: "スクール名を入力してください。" };
  if (!email) {
    return {
      error:
        "メールアドレスを入力してください。保護者がメールに返信したときの宛先になります。",
    };
  }

  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return { error: "ブランドカラーは #RRGGBB の形式で入力してください。" };
  }

  const supabase = await createClient();

  // brand_settings は organization_id が主キー。無ければ作り、あれば更新する
  const { error } = await supabase.from("brand_settings").upsert(
    {
      organization_id: orgId,
      studio_name: studioName,
      brand_color: brandColor,
      tel: orNull(formData.get("tel")),
      email,
      postal_code: orNull(formData.get("postal_code")),
      address: orNull(formData.get("address")),
      website: orNull(formData.get("website")),
      invoice_registration_number: orNull(
        formData.get("invoice_registration_number"),
      ),
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("brand_settings の保存に失敗しました", error);
    return { error: "保存できませんでした。入力内容を確認してください。" };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * ロゴのアップロード（設計書 12章）
 * ────────────────────────────────────────────────
 * 置き場所は Supabase Storage の brand バケット。パスは
 *
 *   <organization_id>/logo-<乱数>.<拡張子>
 *
 * 先頭をテナントの id にしてあるので、Storage 側の RLS も
 * 「そのフォルダが自分のテナントか」で閉じられる（移行 022）。
 *
 * ★ 毎回、別のファイル名で置く。
 *   同じ名前で上書きすると CDN と保護者のブラウザに古い画像が残り、
 *   「変えたのに戻らない」ことになる。新しいものを置いてから古いものを消す。
 *
 * ★ 拡張子ではなく MIME で判定する。
 *   .png に変えただけの実行ファイルを弾くため。バケット側にも
 *   allowed_mime_types と 2MB の上限を設定してある。
 */
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function uploadLogo(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { membership } = await requireOwner();
  const orgId = membership.organizationId;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "画像を選んでください。" };
  }

  const ext = LOGO_TYPES[file.type];
  if (!ext) {
    return { error: "PNG / JPG / WebP / SVG の画像を選んでください。" };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "画像は 2MB までです。" };
  }

  const supabase = await createClient();

  // 差し替え前の URL を控えておく。新しいものを置けてから消す
  const { data: current } = await supabase
    .from("brand_settings")
    .select("logo_url")
    .eq("organization_id", orgId)
    .maybeSingle();

  const path = `${orgId}/logo-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("brand")
    .upload(path, file, { contentType: file.type, cacheControl: "3600" });

  if (uploadError) {
    console.error("ロゴのアップロードに失敗しました", uploadError);
    return { error: "アップロードできませんでした。" };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("brand").getPublicUrl(path);

  const { error } = await supabase
    .from("brand_settings")
    .upsert(
      { organization_id: orgId, logo_url: publicUrl },
      { onConflict: "organization_id" },
    );

  if (error) {
    // 参照されないファイルが残らないよう、置いたものを消してから戻す
    console.error("logo_url の保存に失敗しました", error);
    await supabase.storage.from("brand").remove([path]);
    return { error: "保存できませんでした。" };
  }

  await removeStoredLogo(supabase, orgId, current?.logo_url ?? null);

  revalidatePath("/admin", "layout");
  revalidatePath("/my", "layout");
  revalidatePath("/staff", "layout");
  return { ok: true };
}

/** ロゴを外す。未登録の状態に戻り、スクール名の頭文字が表示される */
export async function removeLogo(): Promise<SettingsState> {
  const { membership } = await requireOwner();
  const orgId = membership.organizationId;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("brand_settings")
    .select("logo_url")
    .eq("organization_id", orgId)
    .maybeSingle();

  const { error } = await supabase
    .from("brand_settings")
    .update({ logo_url: null })
    .eq("organization_id", orgId);

  if (error) {
    console.error("ロゴの削除に失敗しました", error);
    return { error: "削除できませんでした。" };
  }

  await removeStoredLogo(supabase, orgId, current?.logo_url ?? null);

  revalidatePath("/admin", "layout");
  revalidatePath("/my", "layout");
  revalidatePath("/staff", "layout");
  return { ok: true };
}

/**
 * 参照されなくなった画像ファイルを消す
 *
 * 業務データの物理削除はしない方針だが（CLAUDE.md）、これは差し替えで
 * 誰からも参照されなくなった画像であって、記録ではない。残しても意味が無い。
 * 消せなくても画面上は困らないので、失敗しても処理は続ける。
 */
async function removeStoredLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  previousUrl: string | null,
) {
  if (!previousUrl) return;

  const marker = "/brand/";
  const at = previousUrl.indexOf(marker);
  if (at === -1) return;

  const path = previousUrl.slice(at + marker.length);
  // 他テナントのパスを渡されても消せないが、念のためここでも確かめる
  if (!path.startsWith(`${orgId}/`)) return;

  const { error } = await supabase.storage.from("brand").remove([path]);
  if (error) console.error("古いロゴを消せませんでした", error);
}

/**
 * スタジオ規約の保存（設計書 4.1）
 *
 * 保護者のマイページに出す文章。空にすると、保護者側でも表示されなくなる。
 * 最終更新の日時を持たせるのは、「いつの版を読んだか」を保護者が判断できる
 * ようにするため。
 */
export async function saveTerms(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { membership } = await requireOwner();

  const raw = formData.get("terms");
  const terms = typeof raw === "string" && raw.trim() !== "" ? raw : null;

  const supabase = await createClient();
  const { error } = await supabase.from("brand_settings").upsert(
    {
      organization_id: membership.organizationId,
      terms,
      terms_updated_at: terms ? new Date().toISOString() : null,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("規約の保存に失敗しました", error);
    return { error: "保存できませんでした。" };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/my/terms");
  return { ok: true };
}
