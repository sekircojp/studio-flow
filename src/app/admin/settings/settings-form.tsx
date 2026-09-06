"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { saveBrandSettings, type SettingsState } from "./actions";
import type { Brand } from "@/lib/brand";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 入力項目は、入れないと何が起きるかで3段階に分ける。
 *
 *   required … 空だと今すぐ困る。保存できない
 *   later    … いま空でもよいが、帳票を出す段になると要る
 *   optional … 無くても運用できる
 *
 * 全部を必須にすると、試しに触りたい人が最初の画面で止まる。
 * 逆に全部を任意にすると、住所が空のまま数か月運用してから領収書を
 * 出そうとして詰まる。どちらの説明も画面に書いておく。
 */
type Need = "required" | "later" | "optional";

const NEED_LABEL: Record<Need, { text: string; className: string }> = {
  required: { text: "必須", className: "bg-sf-danger/10 text-sf-danger" },
  later: { text: "帳票に必要", className: "bg-sf-warn/14 text-sf-warn" },
  optional: { text: "任意", className: "bg-sf-ink/8 text-sf-muted" },
};

function NeedBadge({ need }: { need: Need }) {
  return (
    <span
      className={`mb-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${NEED_LABEL[need].className}`}
    >
      {NEED_LABEL[need].text}
    </span>
  );
}

function Field({
  name,
  label,
  need,
  hint,
  type = "text",
  defaultValue,
  className = "",
  inputRef,
  ...rest
}: {
  name: string;
  label: string;
  need: Need;
  hint?: string;
  type?: string;
  defaultValue?: string;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <label htmlFor={name} className={labelClass}>
          {label}
        </label>
        <NeedBadge need={need} />
      </div>
      <input
        id={name}
        name={name}
        type={type}
        ref={inputRef}
        required={need === "required"}
        defaultValue={defaultValue}
        className={fieldClass}
        {...rest}
      />
      {hint && (
        <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">{hint}</p>
      )}
    </div>
  );
}

export default function SettingsForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    saveBrandSettings,
    {},
  );

  const addressRef = useRef<HTMLInputElement>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "notfound">("idle");

  /**
   * 郵便番号から住所を引く
   *
   * zipcloud（無料・登録不要）を使う。外部サービスなので、落ちていても
   * 手入力できるようにしておく。番地までは分からないので、引けた分を
   * 入れて、続きは利用者に足してもらう。
   */
  async function lookupPostalCode(raw: string) {
    const code = raw.replace(/[^0-9]/g, "");
    if (code.length !== 7) return;

    setLookup("loading");
    try {
      const res = await fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`,
      );
      const json = await res.json();
      const found = json?.results?.[0];
      if (!found) {
        setLookup("notfound");
        return;
      }
      const address = `${found.address1}${found.address2}${found.address3}`;
      const input = addressRef.current;
      if (input) {
        // 既に番地まで入っている場合は上書きしない
        if (!input.value.trim()) input.value = address;
        else if (!input.value.startsWith(address)) input.value = address;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      setLookup("idle");
    } catch {
      setLookup("notfound");
    }
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-4">
        <Field
          name="studio_name"
          label="スクール名"
          need="required"
          defaultValue={brand.studioName}
          hint="保護者向けの画面と、メールの差出人名に使われます"
          className="max-w-md"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="email"
            label="メールアドレス"
            need="required"
            type="email"
            defaultValue={brand.email ?? ""}
            hint="保護者がメールに返信したときの宛先です。空だと返信がどこにも届きません"
          />
          <Field
            name="tel"
            label="電話番号"
            need="later"
            type="tel"
            defaultValue={brand.tel ?? ""}
            hint="領収書・請求書に載ります"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-sf-bg p-4">
        <p className="text-[13px] font-medium text-sf-body">住所</p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <div className="flex items-center gap-2">
              <label htmlFor="postal_code" className={labelClass}>
                郵便番号
              </label>
              <NeedBadge need="later" />
            </div>
            <input
              id="postal_code"
              name="postal_code"
              type="text"
              inputMode="numeric"
              placeholder="4440000"
              defaultValue={brand.postalCode ?? ""}
              onChange={(e) => {
                setLookup("idle");
                // 7桁そろった時点で自動で引く。押し忘れを無くす
                if (e.target.value.replace(/[^0-9]/g, "").length === 7) {
                  void lookupPostalCode(e.target.value);
                }
              }}
              className={fieldClass}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(
                "postal_code",
              ) as HTMLInputElement | null;
              if (el) void lookupPostalCode(el.value);
            }}
            className="mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-sf-border-strong bg-white px-3 py-1.5 text-[13px] font-medium text-sf-body transition hover:border-sf-muted"
          >
            {lookup === "loading" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="size-3.5" aria-hidden />
            )}
            住所を入れる
          </button>

          {lookup === "notfound" && (
            <p className="mb-2 text-[12px] text-sf-muted">
              その郵便番号は見つかりませんでした。手で入力してください。
            </p>
          )}
        </div>

        <Field
          name="address"
          label="住所"
          need="later"
          defaultValue={brand.address ?? ""}
          inputRef={addressRef}
          hint="郵便番号を入れると、市区町村までが自動で入ります。番地・建物名は続けて入力してください"
          className="max-w-xl"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="invoice_registration_number"
          label="適格請求書発行事業者の登録番号"
          need="optional"
          defaultValue={brand.invoiceRegistrationNumber ?? ""}
          hint="登録している場合だけ入れてください。免税事業者は空のままで構いません（未入力なら帳票に表記しません）"
        />
        <Field
          name="website"
          label="ウェブサイト"
          need="optional"
          type="url"
          defaultValue={brand.website ?? ""}
        />
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
            className="h-9 w-12 cursor-pointer rounded-lg border border-sf-border-strong bg-white p-1"
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
