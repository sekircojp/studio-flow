"use client";

import { useState } from "react";
import { brandInitial, type Brand } from "@/lib/brand";

/**
 * 横長とみなす縦横比のしきい値
 *
 * 社名を横に並べたロゴ（ワードマーク）は、だいたい 2:1 より横長になる。
 * 丸や四角の中に絵を入れたロゴ（シンボル）は 1:1 前後。
 * 1.8 で切ると、両者はきれいに分かれる。
 */
const WIDE_RATIO = 1.8;

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
  onAspect,
}: {
  brand: Brand;
  /** ロゴの高さ。未登録時のイニシャルは size 角の正方形になる */
  size?: number;
  /** 横長すぎるロゴを止める幅。既定は高さの4倍 */
  maxWidth?: number;
  /** 読み込めた時点で、横長かどうかを親に知らせる */
  onAspect?: (wide: boolean) => void;
}) {
  /**
   * 縦横比を親に伝える。
   *
   * ★ onLoad だけでは足りない。
   *   画像はサーバーが返した HTML の時点で読み込みが始まるので、React が
   *   ハイドレーションで onLoad を張る前に読み終わっていることがある。
   *   その場合 load は二度と起きず、ずっと判定がつかないままになる
   *   （スクール名が出ないという不具合になった）。
   *   ref が付いた時点でも complete を見て、済んでいればそこで伝える。
   */
  const measure = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalHeight > 0) {
      onAspect?.(el.naturalWidth / el.naturalHeight >= WIDE_RATIO);
    }
  };

  if (brand.logoUrl) {
    return (
      // 外部ストレージの URL を扱うため next/image ではなく img を使う。
      // Supabase Storage のドメインを next.config に登録すれば置き換えられる。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.studioName}
        ref={measure}
        style={{ height: size, maxWidth, width: "auto" }}
        className="shrink-0 object-contain"
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalHeight > 0) {
            onAspect?.(el.naturalWidth / el.naturalHeight >= WIDE_RATIO);
          }
        }}
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

/**
 * 画面の左上に出す「ロゴ＋スクール名」
 * ────────────────────────────────────────────────
 * ロゴの形で出し分ける。
 *
 *   横長のロゴ（社名が入っている）… ロゴだけ。隣に同じ文字を置くと重複し、
 *                                   どちらも幅が足りずに切れる
 *   正方形のロゴ（シンボル）      … ロゴ＋スクール名。マークだけでは
 *                                   どこのスタジオか分からない
 *   ロゴ未登録                     … 頭文字＋スクール名（設計書 12章）
 *
 * 縦横比は画像を読み込んでから分かるので、判定がつくまでは名前を出さない。
 * 先に出すと、横長のロゴのときに文字が一瞬重なって消える。
 */
export function BrandLockup({
  brand,
  size = 28,
  maxWidth,
  nameClassName = "text-[13px] font-bold text-sf-ink",
  subLabel,
  className = "",
}: {
  brand: Brand;
  size?: number;
  maxWidth?: number;
  nameClassName?: string;
  /** 名前の下に添える小さな文字（講師名など） */
  subLabel?: string;
  className?: string;
}) {
  const [wide, setWide] = useState<boolean | null>(null);

  // ロゴが無ければ必ず名前を出す。あるときは、正方形と分かってから出す
  const showName = !brand.logoUrl || wide === false;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <BrandMark
        brand={brand}
        size={size}
        maxWidth={maxWidth}
        onAspect={setWide}
      />
      {(showName || subLabel) && (
        <span className="min-w-0 flex-1">
          {showName && (
            <span className={`block truncate ${nameClassName}`}>
              {brand.studioName}
            </span>
          )}
          {subLabel && (
            <span className="block truncate text-[11px] text-sf-muted">
              {subLabel}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
