"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Check, Eye, Loader2, RotateCcw } from "lucide-react";
import {
  previewEmailTemplate,
  resetEmailTemplate,
  saveEmailTemplate,
  type TemplateState,
} from "./actions";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

/**
 * メール文面の編集（設計書 11章）
 *
 * ★ 件名も本文も直せるようにする。
 *   件名だけ固定だと、結局そのスタジオの言い回しにならない。
 *
 * ★ 差し込みは押して入れる。
 *   手で打つと綴りを間違え、送るときに黙って空になる。一覧から押して
 *   入れれば間違えようがない。保存時にも綴りを確かめる。
 *
 * ★ プレビューはサーバーで作る。
 *   実際に送るときと同じ関数（DB の app.render_template）を通す。画面側で
 *   もう一度実装すると必ずずれる。
 */

export type TemplateItem = {
  kind: string;
  label: string;
  note: string;
  subject: string;
  body: string;
  isCustom: boolean;
  placeholders: string[];
  sample: Record<string, string>;
};

export function TemplateEditor({ item }: { item: TemplateItem }) {
  const [state, action, pending] = useActionState<TemplateState, FormData>(
    saveEmailTemplate,
    {},
  );

  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // 最後に触れた欄に差し込む。既定は本文（そちらに入れることが多い）
  const lastFocused = useRef<"subject" | "body">("body");

  const insert = (token: string) => {
    const target =
      lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    if (!target) return;

    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const next = target.value.slice(0, start) + token + target.value.slice(end);

    if (lastFocused.current === "subject") setSubject(next);
    else setBody(next);

    // 差し込んだ直後にカーソルを続きへ置く。続けて打てるように
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const runPreview = () => {
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewEmailTemplate(subject, body, item.sample);
      if ("error" in result) {
        setPreviewError(result.error);
        setPreview(null);
      } else {
        setPreview(result);
      }
    });
  };

  const reset = () => {
    if (!confirm("この文面を既定に戻します。編集した内容は消えます。")) return;
    startTransition(async () => {
      await resetEmailTemplate(item.kind);
    });
  };

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="kind" value={item.kind} />

        <div>
          <label htmlFor={`${item.kind}-subject`} className={labelClass}>
            件名
          </label>
          <input
            id={`${item.kind}-subject`}
            name="subject"
            ref={subjectRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => (lastFocused.current = "subject")}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${item.kind}-body`} className={labelClass}>
            本文
          </label>
          <textarea
            id={`${item.kind}-body`}
            name="body"
            ref={bodyRef}
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => (lastFocused.current = "body")}
            className="mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-2.5 py-2 font-mono text-[13px] leading-relaxed text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20"
          />
        </div>

        <div>
          <p className="text-[12px] font-medium text-sf-body">
            差し込める項目（押すと入ります）
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.placeholders.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => insert(`{{${p}}}`)}
                className="rounded-md border border-sf-border-strong bg-white px-2 py-1 font-mono text-[11px] text-sf-body transition hover:border-sf-accent hover:text-sf-ink"
              >
                {`{{${p}}}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-sf-muted">
            未入力の項目は空になります。差し込みだけの行は、空のときに行ごと
            消えるので、「会場」などが未入力でもラベルだけが残りません。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-sf-border pt-4">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            保存する
          </button>
          <button
            type="button"
            onClick={runPreview}
            disabled={busy}
            className={secondaryButtonClass}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Eye className="size-3.5" aria-hidden />
            )}
            見本で確認する
          </button>
          {item.isCustom && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className={secondaryButtonClass}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              既定の文面に戻す
            </button>
          )}
          {state.message && (
            <span className="flex items-center gap-1 text-[13px] text-sf-ok">
              <Check className="size-4" aria-hidden />
              {state.message}
            </span>
          )}
          {state.error && (
            <span className="text-[13px] text-sf-danger">{state.error}</span>
          )}
        </div>
      </form>

      {previewError && (
        <p className="text-[13px] text-sf-danger">{previewError}</p>
      )}

      {preview && (
        <div className="rounded-xl border border-sf-border bg-sf-bg p-4">
          <p className="text-[11px] font-medium text-sf-muted">
            見本の値で差し込んだ結果
          </p>
          <p className="mt-2 text-[13px] font-bold text-sf-ink">
            {preview.subject || "（件名が空です）"}
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-sf-body">
            {preview.body}
          </pre>
        </div>
      )}
    </div>
  );
}
