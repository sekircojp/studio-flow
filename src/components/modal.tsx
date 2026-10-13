"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * 小さなモーダル
 *
 * 表の行の中でフォームを広げると列が崩れるので、入金登録や取消は
 * 画面の中央に重ねて出す。Esc と背後の押下で閉じ、閉じると開いた
 * ボタンに焦点を戻す。
 */
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    first?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-sf-nav-deep/45"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sf-enter relative w-full max-w-md rounded-2xl bg-sf-card p-5 shadow-float sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-[16px] font-bold text-sf-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13px] text-sf-body">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-sf-muted transition hover:bg-sf-bg hover:text-sf-ink"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">閉じる</span>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
