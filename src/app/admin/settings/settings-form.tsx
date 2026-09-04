"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveBrandSettings, type SettingsState } from "./actions";
import type { Brand } from "@/lib/brand";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

const FIELDS = [
  {
    name: "studio_name",
    label: "スクール名",
    type: "text",
    hint: "保護者向けの画面と、メールの差出人名に使われます",
  },
  { name: "tel", label: "電話番号", type: "tel", hint: "" },
  {
    name: "email",
    label: "メールアドレス",
    type: "email",
    hint: "保護者がメールに返信したときの宛先になります",
  },
  { name: "address", label: "住所", type: "text", hint: "" },
  { name: "website", label: "ウェブサイト", type: "url", hint: "" },
  {
    name: "invoice_registration_number",
    label: "適格請求書発行事業者の登録番号",
    type: "text",
    hint: "任意。未入力なら帳票に表記しません（免税事業者は空のままで構いません）",
  },
] as const;

export default function SettingsForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    saveBrandSettings,
    {},
  );

  const initial: Record<string, string> = {
    studio_name: brand.studioName,
    tel: brand.tel ?? "",
    email: brand.email ?? "",
    address: brand.address ?? "",
    website: brand.website ?? "",
    invoice_registration_number: brand.invoiceRegistrationNumber ?? "",
  };

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name} className={f.name === "address" ? "sm:col-span-2" : ""}>
            <label htmlFor={f.name} className={labelClass}>
              {f.label}
            </label>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              defaultValue={initial[f.name]}
              className={fieldClass}
            />
            {f.hint && (
              <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
                {f.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-sf-bg p-4">
        <label htmlFor="brand_color" className={labelClass}>
          ブランドカラー
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="brand_color"
            name="brand_color"
            type="color"
            defaultValue={brand.brandColor ?? "#f0665c"}
            className="h-10 w-14 cursor-pointer rounded-lg border border-sf-border-strong bg-white p-1"
          />
          <p className="text-[11px] leading-relaxed text-sf-muted">
            ボタン・リンク・選択状態などのアクセントに使います。
            背景全体は塗り替えません（濃い色を選んでも文字が読めなくならないようにするため）。
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-sf-border pt-5">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          保存する
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
