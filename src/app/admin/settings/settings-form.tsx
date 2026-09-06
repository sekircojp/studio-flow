"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveBrandSettings, type SettingsState } from "./actions";
import type { Brand } from "@/lib/brand";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 入力項目は、入れないと何が起きるかで3段階に分ける。
 *
     required … 空だと今すぐ困る。保存できない
     later    … いま空でもよいが、帳票を出す段になると要る
     optional … 無くても運用できる
 *
 * 全部を必須にすると、試しに触りたい人が最初の画面で止まる。
 * 逆に全部を任意にすると、住所が空のまま数か月運用してから領収書を
 * 出そうとして詰まる。どちらの説明も画面に書いておく。
 */
type Need = "required" | "later" | "optional";

const NEED_LABEL: Record<Need, { text: string; className: string }> = {
  required: {
    text: "必須",
    className: "bg-sf-danger/10 text-sf-danger",
  },
  later: {
    text: "帳票に必要",
    className: "bg-sf-warn/14 text-sf-warn",
  },
  optional: {
    text: "任意",
    className: "bg-sf-ink/8 text-sf-muted",
  },
};

const FIELDS = [
  {
    name: "studio_name",
    label: "スクール名",
    type: "text",
    need: "required" as Need,
    hint: "保護者向けの画面と、メールの差出人名に使われます",
  },
  {
    name: "email",
    label: "メールアドレス",
    type: "email",
    need: "required" as Need,
    hint: "保護者がメールに返信したときの宛先です。空だと返信がどこにも届きません",
  },
  {
    name: "tel",
    label: "電話番号",
    type: "tel",
    need: "later" as Need,
    hint: "領収書・請求書に載ります",
  },
  {
    name: "address",
    label: "住所",
    type: "text",
    need: "later" as Need,
    hint: "領収書・請求書に載ります",
  },
  {
    name: "invoice_registration_number",
    label: "適格請求書発行事業者の登録番号",
    type: "text",
    need: "optional" as Need,
    hint: "登録している場合だけ入れてください。免税事業者は空のままで構いません（未入力なら帳票に表記しません）",
  },
  {
    name: "website",
    label: "ウェブサイト",
    type: "url",
    need: "optional" as Need,
    hint: "",
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
          <div
            key={f.name}
            className={f.name === "address" ? "sm:col-span-2" : ""}
          >
            <div className="flex items-center gap-2">
              <label htmlFor={f.name} className={labelClass}>
                {f.label}
              </label>
              <span
                className={`mb-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${NEED_LABEL[f.need].className}`}
              >
                {NEED_LABEL[f.need].text}
              </span>
            </div>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              required={f.need === "required"}
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
