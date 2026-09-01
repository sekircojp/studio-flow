"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createInstructor, type InstructorState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

export function InstructorForm() {
  const [state, action, pending] = useActionState<InstructorState, FormData>(
    createInstructor,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ins-name" className={labelClass}>
            講師名
          </label>
          <input id="ins-name" name="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="ins-kana" className={labelClass}>
            ふりがな
          </label>
          <input id="ins-kana" name="name_kana" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="ins-tel" className={labelClass}>
            電話番号
          </label>
          <input id="ins-tel" name="tel" type="tel" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="ins-email" className={labelClass}>
            メールアドレス
          </label>
          <input
            id="ins-email"
            name="email"
            type="email"
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          講師を追加
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}
