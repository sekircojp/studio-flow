"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AdminNavList } from "@/components/admin-nav";
import { BrandLockup } from "@/components/brand-mark";
import type { Brand } from "@/lib/brand";

/**
 * 狭い幅（lg 未満）で使う開閉メニュー
 *
 * サイドバーは 1,024px 未満で隠れるので、代わりにここから主要画面へ移る。
 * 左から出る板にメニューを載せ、外側を押すか Esc で閉じる。
 *
 * キーボード
 *   開いたら閉じるボタンに焦点を移す。閉じたら開いたボタンへ戻す。
 *   Tab は板の中で循環させる（板の外へ出ると、背後の画面を操作することになる）。
 * 画面が変わったら閉じる（押した先に移ったのに板が残らないように）。
 */
export function AdminMobileNav({ brand }: { brand: Brand }) {
  // 「どの画面で開いたか」を持つ。画面が変わると一致しなくなり、自然に閉じる
  const [openPath, setOpenPath] = useState<string | null>(null);
  const pathname = usePathname();
  const open = openPath === pathname;
  const setOpen = (next: boolean) => setOpenPath(next ? pathname : null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPath(null);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={`${titleId}-panel`}
        className="flex size-9 items-center justify-center rounded-full border border-sf-border/80 bg-white/70 text-sf-ink transition duration-150 hover:border-sf-border-strong focus-visible:sf-ring lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
        <span className="sr-only">メニューを開く</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* 背後。押すと閉じる */}
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-sf-nav-deep/50"
          />
          <div
            ref={panelRef}
            id={`${titleId}-panel`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-gradient-to-b from-sf-nav to-sf-nav-deep px-3.5 py-4 shadow-float"
          >
            <div className="flex items-center gap-2">
              <BrandLockup
                brand={brand}
                size={24}
                maxWidth={160}
                className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2"
              />
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-sf-nav-ink transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="size-5" aria-hidden />
                <span className="sr-only">メニューを閉じる</span>
              </button>
            </div>
            <h2 id={titleId} className="sr-only">
              メニュー
            </h2>
            <div className="mt-5 flex-1 overflow-y-auto">
              <AdminNavList onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
