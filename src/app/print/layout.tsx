import type { Metadata } from "next";

export const metadata: Metadata = { title: "帳票" };

/**
 * 帳票（印刷用）の枠
 * ────────────────────────────────────────────────
 * /admin の下に置くとサイドバーが付いてくるので、経路を分けている。
 * 認証は各ページで requireAdmin() を通す。URL を直接叩いても、
 * 他テナントの請求は RLS とアプリ層の両方で弾かれる（設計書 3章）。
 *
 * PDF はサーバーで作らず、ブラウザの印刷機能に任せる。
 * 日本語フォントの埋め込みが要らず、そのまま紙にも出せる。
 * 保護者へメールで送る段になったら、サーバー生成に差し替える。
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-sf-bg">{children}</div>;
}
