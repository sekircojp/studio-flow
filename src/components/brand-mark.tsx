import { brandInitial, type Brand } from "@/lib/brand";

/**
 * スタジオのロゴ表示（設計書 12章）
 *
 * ★ size は「高さ」であって、正方形の一辺ではない。
 *   ロゴは横長のことが多い（社名を並べた形）。正方形の枠に収めると
 *   縦横比を保ったまま極端に小さくなり、線にしか見えなくなる。
 *   高さを揃えて、幅は成り行きに任せる。長すぎるものだけ maxWidth で止める。
 *
 * - ロゴは PNG / JPG / WebP / SVG。object-contain で縦横比を保つ
 * - 未登録ならイニシャルを出す。こちらは正方形。
 *   ロゴの有無でレイアウトが崩れないよう、高さは同じにする
 */
export function BrandMark({
  brand,
  size = 32,
  maxWidth = size * 4,
}: {
  brand: Brand;
  /** ロゴの高さ。未登録時のイニシャルは size 角の正方形になる */
  size?: number;
  /** 横長すぎるロゴを止める幅。既定は高さの4倍 */
  maxWidth?: number;
}) {
  if (brand.logoUrl) {
    return (
      // 外部ストレージの URL を扱うため next/image ではなく img を使う。
      // Supabase Storage のドメインを next.config に登録すれば置き換えられる。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.studioName}
        style={{ height: size, maxWidth, width: "auto" }}
        className="shrink-0 object-contain"
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        backgroundColor: brand.brandColor ?? undefined,
      }}
      className="flex shrink-0 items-center justify-center rounded bg-black/10 text-sm font-bold text-white dark:bg-white/20"
      aria-hidden
    >
      {brandInitial(brand.studioName)}
    </span>
  );
}
