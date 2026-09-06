"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveBillingSettings, type BillingState } from "../actions";
import type { BillingSettings } from "./page";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 兄弟割の設定（設計書 5.5）
 *
 * 設定は6項目だけ。ルールエンジンは実装しない。
 */
export function BillingSettingsForm({ settings }: { settings: BillingSettings }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(
    saveBillingSettings,
    {},
  );
  const [enabled, setEnabled] = useState(settings.sibling_discount_enabled);
  const [type, setType] = useState(settings.sibling_discount_type);

  return (
    <form action={action} className="space-y-6">
      <label className="flex items-start gap-3 rounded-xl bg-sf-bg p-4">
        <input
          type="checkbox"
          name="sibling_discount_enabled"
          defaultChecked={settings.sibling_discount_enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="block text-[14px] font-medium text-sf-ink">
            兄弟割を使う
          </span>
          <span className="mt-0.5 block text-[12px] text-sf-muted">
            請求は生徒ごとに作りますが、割引の判定は世帯単位で行います。
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-5 border-l-2 border-sf-accent/30 pl-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sd-target" className={labelClass}>
                対象
              </label>
              <select
                id="sd-target"
                name="sibling_discount_target"
                defaultValue={settings.sibling_discount_target}
                className={fieldClass}
              >
                <option value="second_only">2人目のみ</option>
                <option value="second_and_beyond">2人目以降すべて</option>
              </select>
              <p className="mt-1 text-[11px] text-sf-muted">
                月謝の高い順に並べ、1人目は割引しません
              </p>
            </div>
            <div>
              <label htmlFor="sd-type" className={labelClass}>
                割引のしかた
              </label>
              <select
                id="sd-type"
                name="sibling_discount_type"
                defaultValue={settings.sibling_discount_type}
                onChange={(e) => setType(e.target.value)}
                className={fieldClass}
              >
                <option value="fixed">定額（円）</option>
                <option value="rate">率（%）</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {type === "fixed" ? (
              <div>
                <label htmlFor="sd-amount" className={labelClass}>
                  割引額（円）
                </label>
                <input
                  id="sd-amount"
                  name="sibling_discount_amount"
                  type="number"
                  min={0}
                  defaultValue={settings.sibling_discount_amount}
                  className={fieldClass}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="sd-rate" className={labelClass}>
                  割引率（%）
                </label>
                <input
                  id="sd-rate"
                  name="sibling_discount_rate"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={Math.round(settings.sibling_discount_rate * 100)}
                  className={fieldClass}
                />
              </div>
            )}
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="count_suspended_in_siblings"
              defaultChecked={settings.count_suspended_in_siblings}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="block text-[13px] font-medium text-sf-ink">
                休会中の生徒も人数に数える
              </span>
              <span className="mt-0.5 block text-[12px] text-sf-muted">
                外すと、兄が休会した瞬間に弟の割引が消えます。既定は「数える」です。
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="grid max-w-lg gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="issue-day" className={labelClass}>
            請求を作る日（毎月）
          </label>
          <input
            id="issue-day"
            name="issue_day"
            type="number"
            min={1}
            max={28}
            defaultValue={settings.issue_day}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            この日の朝に、その月の請求が自動で作られます
          </p>
        </div>

        <div>
          <label htmlFor="due-day" className={labelClass}>
            支払期限（請求月の何日）
          </label>
          <input
            id="due-day"
            name="due_day"
            type="number"
            min={1}
            max={28}
            defaultValue={settings.due_day}
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            月末の日数が月ごとに違うため、どちらも28日までにしています
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
