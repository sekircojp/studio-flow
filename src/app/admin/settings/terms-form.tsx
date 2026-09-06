"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveTerms, type SettingsState } from "./actions";
import type { Brand } from "@/lib/brand";
import { labelClass, primaryButtonClass } from "@/components/ui";

/**
 * スタジオ規約の編集（設計書 4.1）
 *
 * 入会案内・受講規約・キャンセル規定など、保護者に読んでもらう文章。
 * 書式は付けない。見出しや箇条書きが要るほど長い規約なら、
 * PDF を配ったほうが読まれる。
 */
export default function TermsForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    saveTerms,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="terms" className={labelClass}>
          規約の本文
        </label>
        <textarea
          id="terms"
          name="terms"
          rows={14}
          defaultValue={brand.terms ?? ""}
          placeholder={
            "【受講について】\n・レッスンの5分前までにお越しください。\n\n【欠席・振替】\n・欠席のご連絡はレッスン開始2時間前までにお願いします。\n\n【月謝】\n・毎月27日までに集金いたします。"
          }
          className="mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-2.5 py-2 text-[14px] leading-relaxed text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
          保護者のマイページに、そのまま表示されます。改行はそのまま残ります。
          空にすると、保護者側にも表示されません。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          規約を保存する
        </button>
        {state.ok && (
          <span className="flex items-center gap-1 text-[13px] text-sf-ok">
            <Check className="size-4" aria-hidden />
            保存しました
          </span>
        )}
        {state.error && (
          <span className="text-[13px] text-sf-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
