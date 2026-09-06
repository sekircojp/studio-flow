"use client";

import { useActionState, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { removeLogo, uploadLogo, type SettingsState } from "./actions";
import { BrandMark } from "@/components/brand-mark";
import type { Brand } from "@/lib/brand";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { trimImageMargins } from "@/lib/trim-image";

/**
 * ロゴのアップロード（設計書 12章）
 *
 * 選んだ瞬間に手元でプレビューを出す。アップロードしてから
 * 「思っていたのと違う」と気付くのを避けるため。
 *
 * 表示は BrandMark をそのまま使う。設定画面での見え方と、実際に
 * サイドバーへ出る見え方が食い違わないようにする。
 *
 * 選ばれた画像は、送る前に余白を切り落とす。ロゴは正方形の中に横長の
 * 文字を置いた形で作られていることが多く、そのままだと高さを揃えたときに
 * 文字が線にしか見えなくなる。切った結果をプレビューに出すので、
 * 何が起きたかは登録前に分かる。
 */
export default function LogoForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    uploadLogo,
    {},
  );
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // プレビュー中はそちらを、無ければ登録済みのものを出す
  const shown: Brand = preview ? { ...brand, logoUrl: preview } : brand;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-56 shrink-0 items-center justify-center rounded-xl border border-sf-border bg-white p-3">
          <BrandMark brand={shown} size={56} maxWidth={200} />
        </div>

        <form action={action} className="min-w-0 flex-1 space-y-3">
          <input
            ref={inputRef}
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            required
            onChange={async (e) => {
              const input = e.target;
              const picked = input.files?.[0];
              if (!picked) {
                setPreview(null);
                setTrimmed(false);
                return;
              }

              setReading(true);
              try {
                const result = await trimImageMargins(picked);
                // 切った画像を送るため、選択そのものを差し替える。
                // 代入では change が起きないので、ここで無限に回ることはない
                if (result.trimmed) {
                  const dt = new DataTransfer();
                  dt.items.add(result.file);
                  input.files = dt.files;
                }
                setTrimmed(result.trimmed);
                setPreview(URL.createObjectURL(result.file));
              } finally {
                setReading(false);
              }
            }}
            className="block w-full text-[13px] text-sf-body file:mr-3 file:rounded-lg file:border-0 file:bg-sf-ink/8 file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-sf-ink hover:file:bg-sf-ink/12"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || removing || reading}
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
            {reading && (
              <p className="text-[13px] text-sf-muted">読み込んでいます…</p>
            )}
            {!reading && trimmed && !state.ok && (
              <p className="text-[13px] text-sf-muted">
                まわりの余白を切り取りました
              </p>
            )}
          </div>
        </form>
      </div>

      <p className="text-[11px] leading-relaxed text-sf-muted">
        PNG / JPG / WebP / SVG、2MB まで。まわりの余白は自動で切り取ります
        （正方形の画像に横長の文字が入っていても、文字の大きさで表示されます）。
        縦横比はそのまま保たれるので切れることはありません。背景が透過している
        画像がきれいに出ます。未登録のときは、スクール名の頭文字がブランド
        カラーで表示されます。
      </p>
    </div>
  );
}
