"use client";

import { useActionState } from "react";
import { Check, Loader2, Ruler } from "lucide-react";
import { recordMySize, type SizeState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 衣装サイズの登録（設計書 4.3）
 *
 * ★ 全部を必須にしない。
 *   身長だけ分かっている、靴のサイズだけ変わった、ということが普通に
 *   ある。分かるところだけ入れて送れるようにする。
 *
 * ★ ウェアのサイズは文字のまま受け取る。
 *   150 / M / 130-140 と表記が揺れる。数値に直そうとすると、実際に
 *   タグに書いてある文字を入れられなくなる。
 */
export function SizeForm({
  studentId,
  latest,
}: {
  studentId: string;
  latest: {
    height: number | null;
    wearSize: string | null;
    shoeSize: number | null;
  } | null;
}) {
  const [state, action, pending] = useActionState<SizeState, FormData>(
    recordMySize,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="height" className={labelClass}>
            身長（cm）
          </label>
          <input
            id="height"
            name="height"
            inputMode="decimal"
            placeholder={latest?.height ? String(latest.height) : "138"}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="shoe_size" className={labelClass}>
            靴のサイズ（cm）
          </label>
          <input
            id="shoe_size"
            name="shoe_size"
            inputMode="decimal"
            placeholder={latest?.shoeSize ? String(latest.shoeSize) : "22.5"}
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="wear_size" className={labelClass}>
            ウェアのサイズ
          </label>
          <input
            id="wear_size"
            name="wear_size"
            placeholder={latest?.wearSize ?? "150 / M など"}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            タグに書いてあるとおりで大丈夫です。
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="note" className={labelClass}>
            気になること
          </label>
          <input
            id="note"
            name="note"
            placeholder="袖が短めだと動きやすいです、など"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Ruler className="size-4" aria-hidden />
          )}
          登録する
        </button>
        {state.ok && (
          <span className="flex items-center gap-1 text-[13px] text-sf-ok">
            <Check className="size-4" aria-hidden />
            登録しました
          </span>
        )}
        {state.error && (
          <span className="text-[13px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
