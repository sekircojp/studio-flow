"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { saveBrandSettings, type SettingsState } from "./actions";
import type { Brand } from "@/lib/brand";

const FIELDS = [
  { name: "studio_name", label: "スタジオ名", type: "text", hint: "保護者向けの画面やメールの差出人に使われます" },
  { name: "tel", label: "電話番号", type: "tel", hint: "" },
  { name: "email", label: "メールアドレス", type: "email", hint: "保護者がメールに返信したときの宛先になります" },
  { name: "address", label: "住所", type: "text", hint: "" },
  { name: "website", label: "ウェブサイト", type: "url", hint: "" },
  {
    name: "invoice_registration_number",
    label: "適格請求書発行事業者の登録番号",
    type: "text",
    hint: "任意。未入力なら帳票に表記しません（免税事業者の場合は空のままで構いません）",
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
    <form action={action} className="max-w-lg space-y-5">
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="block text-sm font-medium">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type}
            defaultValue={initial[f.name]}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-base outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
          {f.hint && <p className="mt-1 text-xs opacity-60">{f.hint}</p>}
        </div>
      ))}

      <div>
        <label htmlFor="brand_color" className="block text-sm font-medium">
          ブランドカラー
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="brand_color"
            name="brand_color"
            type="color"
            defaultValue={brand.brandColor ?? "#111111"}
            className="h-10 w-16 rounded-md border border-black/15 dark:border-white/20"
          />
          <span className="text-xs opacity-60">
            ボタンや選択状態などのアクセントに使います。背景全体は塗り替えません。
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          保存する
        </button>
        {state.ok && <span className="text-sm text-green-700 dark:text-green-400">保存しました</span>}
        {state.error && (
          <span className="text-sm text-amber-700 dark:text-amber-300">{state.error}</span>
        )}
      </div>
    </form>
  );
}
