import { createClient } from "@/lib/supabase/server";
import { FALLBACK_STUDIO_NAME, type Brand } from "@/lib/brand";

/**
 * ブランド設定の読み出し（サーバー専用）
 *
 * next/headers に依存するため、クライアント側の部品から読み込まないこと。
 * 型と純粋な関数は brand.ts にある。
 *
 * ロゴ URL やカラーを各画面に直接書かず、organization 単位でここに集約する。
 */
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
        "studio_name, logo_url, brand_color, tel, email, postal_code, address, website, invoice_registration_number, terms, terms_updated_at",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  return {
    studioName: brand?.studio_name || org?.name || FALLBACK_STUDIO_NAME,
    logoUrl: brand?.logo_url ?? null,
    brandColor: brand?.brand_color ?? null,
    tel: brand?.tel ?? null,
    email: brand?.email ?? null,
    postalCode: brand?.postal_code ?? null,
    address: brand?.address ?? null,
    website: brand?.website ?? null,
    invoiceRegistrationNumber: brand?.invoice_registration_number ?? null,
    terms: brand?.terms ?? null,
    termsUpdatedAt: brand?.terms_updated_at ?? null,
  };
}
