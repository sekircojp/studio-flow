"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { submitTrial, type TrialState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

export type TrialSlot = {
  id: string;
  className: string;
  roomName: string;
  label: string;
  seatsLeft: number;
};

/**
 * 体験・見学の申込フォーム（公開・設計書 4.6 / 5.2）
 *
 * ★ 空き枠は目安として出す。
 *   確定するのは送信した時点で、その判定はサーバー側で行う。ここに出す
 *   数字は表示した瞬間のもので、他の人が先に申し込むことがある。
 */
export default function TrialForm({
  slug,
  slots,
}: {
  slug: string;
  slots: TrialSlot[];
}) {
  const [state, action, pending] = useActionState<TrialState, FormData>(
    submitTrial,
    {},
  );
  const [lessonId, setLessonId] = useState(slots[0]?.id ?? "");

  if (state.ok) {
    return (
      <div className="rounded-xl border border-sf-ok/40 bg-sf-ok/5 p-6 text-center">
        <Check className="mx-auto size-8 text-sf-ok" aria-hidden />
        <p className="mt-3 text-[15px] font-bold text-sf-ink">
          お申し込みを受け付けました
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-sf-body">
          スタジオが内容を確認したうえで、ご入力いただいたメールアドレスへ
          ご連絡します。<strong className="font-medium text-sf-ink">
          この時点ではまだ確定していません。</strong>しばらくお待ちください。
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl bg-sf-bg p-6 text-center">
        <p className="text-[14px] font-medium text-sf-ink">
          いま受け付けている回がありません
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-sf-body">
          お手数ですが、スタジオへ直接お問い合わせください。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={slug} />

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-sf-ink">参加したい回</h2>
        <p className="text-[12px] leading-relaxed text-sf-muted">
          お申し込みのあと、スタジオが確認してからご連絡します。この場では
          確定しません。
        </p>
        <ul className="space-y-2">
          {slots.map((slot) => (
            <li key={slot.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  lessonId === slot.id
                    ? "border-sf-accent bg-sf-accent/5"
                    : "border-sf-border hover:border-sf-muted"
                }`}
              >
                <input
                  type="radio"
                  name="lesson_id"
                  value={slot.id}
                  checked={lessonId === slot.id}
                  onChange={() => setLessonId(slot.id)}
                  className="mt-1 size-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-sf-ink">
                    {slot.className}
                  </span>
                  <span className="sf-num mt-0.5 block text-[12px] text-sf-muted">
                    {slot.label}
                    {slot.roomName && ` ・ ${slot.roomName}`}
                  </span>
                </span>
                {slot.seatsLeft <= 3 && (
                  <span className="shrink-0 rounded-md bg-sf-warn/14 px-2 py-1 text-[11px] font-medium text-sf-warn">
                    残り {slot.seatsLeft}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="max-w-xs">
          <label htmlFor="kind" className={labelClass}>
            参加のしかた
          </label>
          <select id="kind" name="kind" defaultValue="trial" className={fieldClass}>
            <option value="trial">体験（レッスンに参加する）</option>
            <option value="observation">見学（見るだけ）</option>
          </select>
        </div>
      </section>

      <section className="space-y-4 border-t border-sf-border pt-6">
        <h2 className="text-[15px] font-bold text-sf-ink">お子さまについて</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="student_name" className={labelClass}>
              お名前 <span className="text-sf-danger">必須</span>
            </label>
            <input id="student_name" name="student_name" required className={fieldClass} />
          </div>
          <div>
            <label htmlFor="student_name_kana" className={labelClass}>
              ふりがな
            </label>
            <input id="student_name_kana" name="student_name_kana" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="birth_date" className={labelClass}>
              生年月日
            </label>
            <input id="birth_date" name="birth_date" type="date" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="grade" className={labelClass}>
              学年
            </label>
            <input id="grade" name="grade" placeholder="小2" className={fieldClass} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-sf-border pt-6">
        <h2 className="text-[15px] font-bold text-sf-ink">保護者について</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="guardian_name" className={labelClass}>
              お名前 <span className="text-sf-danger">必須</span>
            </label>
            <input id="guardian_name" name="guardian_name" required className={fieldClass} />
          </div>
          <div>
            <label htmlFor="tel" className={labelClass}>
              電話番号
            </label>
            <input id="tel" name="tel" type="tel" className={fieldClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="email" className={labelClass}>
              メールアドレス <span className="text-sf-danger">必須</span>
            </label>
            <input id="email" name="email" type="email" required className={fieldClass} />
            <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
              当日のご案内や、入会される場合のご連絡に使います。
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-sf-border pt-6">
        <label htmlFor="note" className={labelClass}>
          ご質問・ご要望、アレルギーや配慮が必要なこと
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          className="mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-2.5 py-2 text-[14px] leading-relaxed text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-sf-border pt-6">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          この回に申し込む
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
      </div>
    </form>
  );
}
