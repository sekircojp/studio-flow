import { createClient } from "@/lib/supabase/server";

/**
 * ブランド表示（設計書 12章）
 * ────────────────────────────────────────────────
 * ロゴ URL やカラーを各画面に直接書かず、organization 単位でここに集約する。
 *
 * ブランドカラーはボタン・リンク・選択状態・アクセントにのみ使う。
 * 背景全体は塗り替えない。スタジオが濃い色を選んだときに
 * 文字が読めなくなるため。
 */

export type Brand = {
  studioName: string;
  logoUrl: string | null;
  brandColor: string | null;
  tel: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  invoiceRegistrationNumber: string | null;
};

/** ロゴもスタジオ名も未登録のときに使う既定値 */
const FALLBACK_NAME = "（スタジオ名未設定）";

export async function getBrand(organizationId: string): Promise<Brand> {
  const supabase = await createClient();

  // organizations.name は必須、brand_settings は任意なので分けて引く
  const [{ data: org }, { data: brand }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("brand_settings")
      .select(
        "studio_name, logo_url, brand_color, tel, email, address, website, invoice_registration_number",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  return {
    studioName: brand?.studio_name || org?.name || FALLBACK_NAME,
    logoUrl: brand?.logo_url ?? null,
    brandColor: brand?.brand_color ?? null,
    tel: brand?.tel ?? null,
    email: brand?.email ?? null,
    address: brand?.address ?? null,
    website: brand?.website ?? null,
    invoiceRegistrationNumber: brand?.invoice_registration_number ?? null,
  };
}

/** ロゴが無いときに出すイニシャル（設計書 12章） */
export function brandInitial(studioName: string): string {
  const trimmed = studioName.trim();
  return trimmed ? [...trimmed][0] : "S";
}
