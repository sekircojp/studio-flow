"use client";

import { AlertCircle, Printer, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 帳票の用紙と、画面にだけ出す操作バー
 * ────────────────────────────────────────────────
 * 印刷したときに操作バーが紙に出ないよう、print では消す。
 * 用紙は A4 の幅（210mm）から余白を引いた 182mm を基準にする。
 *
 * dateControl を渡すと、日付を選べるようになる。入金前に領収書を先に
 * 刷るときのためのもの。選んだ日は ?date= に入れてサーバー側で描き直す。
 */
export function PrintSheet({
  backHref,
  dateControl,
  notice,
  children,
}: {
  backHref: string;
  dateControl?: { value: string; label: string };
  notice?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .print-hide { display: none !important; }
          .print-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
          }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="print-hide sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-sf-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sf-accent px-4 py-2 text-sm font-semibold text-sf-accent-ink transition hover:brightness-105"
        >
          <Printer className="size-4" aria-hidden />
          印刷する
        </button>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sf-border-strong bg-white px-3 py-1.5 text-[13px] font-medium text-sf-body transition hover:border-sf-muted"
        >
          <X className="size-3.5" aria-hidden />
          閉じる
        </Link>
        {dateControl && (
          <label className="flex items-center gap-2 text-[12px] text-sf-body">
            {dateControl.label}
            <input
              type="date"
              defaultValue={dateControl.value}
              onChange={(e) => {
                const next = new URLSearchParams(params.toString());
                next.set("date", e.target.value);
                router.replace(`?${next.toString()}`);
              }}
              className="rounded-lg border border-sf-border-strong bg-white px-2 py-1 text-[13px]"
            />
          </label>
        )}

        <p className="text-[12px] text-sf-muted">
          印刷ダイアログで「PDF として保存」を選ぶと、PDF になります。
        </p>

        {notice && (
          <p className="flex w-full items-center gap-1.5 text-[12px] text-sf-warn">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            {notice}
          </p>
        )}
      </div>

      <div className="flex justify-center p-6">
        <div className="print-sheet w-[182mm] rounded-lg bg-white p-10 text-[13px] leading-relaxed text-black shadow-sm">
          {children}
        </div>
      </div>
    </>
  );
}
