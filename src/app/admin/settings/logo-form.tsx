"use client";

import { useActionState, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { removeLogo, uploadLogo, type SettingsState } from "./actions";
import { BrandMark } from "@/components/brand-mark";
import type { Brand } from "@/lib/brand";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/**
 * ロゴのアップロード（設計書 12章）
 *
 * 選んだ瞬間に手元でプレビューを出す。アップロードしてから
 * 「思っていたのと違う」と気付くのを避けるため。
 *
 * 表示は BrandMark をそのまま使う。設定画面での見え方と、実際に
 * サイドバーへ出る見え方が食い違わないようにする。
 */
export default function LogoForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    uploadLogo,
    {},
  );
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // プレビュー中はそちらを、無ければ登録済みのものを出す
  const shown: Brand = preview ? { ...brand, logoUrl: preview } : brand;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex size-20 items-center justify-center rounded-xl border border-sf-border bg-white p-2">
          <BrandMark brand={shown} size={64} />
        </div>

        <form action={action} className="min-w-0 flex-1 space-y-3">
          <input
            ref={inputRef}
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            required
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
            className="block w-full text-[13px] text-sf-body file:mr-3 file:rounded-lg file:border-0 file:bg-sf-ink/8 file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-sf-ink hover:file:bg-sf-ink/12"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || removing}
              className={primaryButtonClass}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ImageUp className="size-4" aria-hidden />
              )}
              このロゴを登録
            </button>

            {brand.logoUrl && (
              <button
                type="button"
                disabled={pending || removing}
                onClick={async () => {
                  setRemoving(true);
                  try {
                    await removeLogo();
                    setPreview(null);
                    if (inputRef.current) inputRef.current.value = "";
                  } finally {
                    setRemoving(false);
                  }
                }}
                className={secondaryButtonClass}
              >
                {removing ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
                ロゴを外す
              </button>
            )}

            {state.error && (
              <p className="text-[13px] text-sf-danger">{state.error}</p>
            )}
            {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
          </div>
        </form>
      </div>

      <p className="text-[11px] leading-relaxed text-sf-muted">
        PNG / JPG / WebP / SVG、2MB まで。縦横比はそのまま保たれるので、
        横長のロゴでも切れません。背景が透過している画像がきれいに出ます。
        未登録のときは、スクール名の頭文字がブランドカラーで表示されます。
      </p>
    </div>
  );
}
