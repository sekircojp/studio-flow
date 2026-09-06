"use client";

import { Printer, X } from "lucide-react";
import Link from "next/link";

/**
 * 帳票の用紙と、画面にだけ出す操作バー
 * ────────────────────────────────────────────────
 * 印刷したときに操作バーが紙に出ないよう、print では消す。
 * 用紙は A4 の幅（210mm）から余白を引いた 182mm を基準にする。
 */
export function PrintSheet({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
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
        <p className="text-[12px] text-sf-muted">
          印刷ダイアログで「PDF として保存」を選ぶと、PDF になります。
        </p>
      </div>

      <div className="flex justify-center p-6">
        <div className="print-sheet w-[182mm] rounded-lg bg-white p-10 text-[13px] leading-relaxed text-black shadow-sm">
          {children}
        </div>
      </div>
    </>
  );
}
