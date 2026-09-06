"use client";

import { useActionState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { submitApplication, type ApplyState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 入会申込フォーム（公開・設計書 4.6）
 *
 * ★ メールアドレスだけは必須にする。
 *   このアドレスが、あとで保護者マイページに入るときの鍵になる。
 *   ここが空だと、承認しても保護者は自分の子どもの情報を見られない。
 */
export default function ApplyForm({
  slug,
  classes,
}: {
  slug: string;
  classes: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(
    submitApplication,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-xl border border-sf-ok/40 bg-sf-ok/5 p-6 text-center">
        <Check className="mx-auto size-8 text-sf-ok" aria-hidden />
        <p className="mt-3 text-[15px] font-bold text-sf-ink">
          お申し込みを受け付けました
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-sf-body">
          スタジオが内容を確認したうえで、ご入力いただいたメールアドレスへ
          ご連絡します。しばらくお待ちください。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={slug} />

      <section className="space-y-4">
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
            <input
              id="grade"
              name="grade"
              placeholder="小2"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="gender" className={labelClass}>
              性別
            </label>
            <select id="gender" name="gender" defaultValue="" className={fieldClass}>
              <option value="">選ばない</option>
              <option value="女">女</option>
              <option value="男">男</option>
              <option value="その他">その他</option>
            </select>
          </div>
          {classes.length > 0 && (
            <div>
              <label htmlFor="desired_class_id" className={labelClass}>
                ご希望のクラス
              </label>
              <select
                id="desired_class_id"
                name="desired_class_id"
                defaultValue=""
                className={fieldClass}
              >
                <option value="">相談したい</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <label htmlFor="guardian_name_kana" className={labelClass}>
              ふりがな
            </label>
            <input id="guardian_name_kana" name="guardian_name_kana" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="relationship" className={labelClass}>
              続柄
            </label>
            <input id="relationship" name="relationship" placeholder="母" className={fieldClass} />
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
              入会後、月謝や欠席連絡を確認するマイページへのログインに使います。
              普段お使いのアドレスをご入力ください。
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className={labelClass}>
              ご住所
            </label>
            <input id="address" name="address" className={fieldClass} />
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
          rows={4}
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
          この内容で申し込む
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
      </div>
    </form>
  );
}
