import { brandInitial, type Brand } from "@/lib/brand";

/**
 * スタジオのロゴ表示（設計書 12章）
 *
 * - ロゴは PNG / JPG / WebP / SVG。object-contain で縦横比を保つ
 * - 未登録ならイニシャルを出す。レイアウトが崩れないよう枠の大きさは固定
 */
export function BrandMark({
  brand,
  size = 32,
}: {
  brand: Brand;
  size?: number;
}) {
  const box = { width: size, height: size };

  if (brand.logoUrl) {
    return (
      // 外部ストレージの URL を扱うため next/image ではなく img を使う。
      // Supabase Storage のドメインを next.config に登録すれば置き換えられる。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.studioName}
        style={box}
        className="shrink-0 rounded object-contain"
      />
    );
  }

  return (
    <span
      style={{ ...box, backgroundColor: brand.brandColor ?? undefined }}
      className="flex shrink-0 items-center justify-center rounded bg-black/10 text-sm font-bold text-white dark:bg-white/20"
      aria-hidden
    >
      {brandInitial(brand.studioName)}
    </span>
  );
}
