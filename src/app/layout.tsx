import type { Metadata } from "next";
import { Geist, Geist_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * 日本語の本文
 *
 * 角ゴシックだが角がわずかに落ちていて、線の終わりが少し柔らかい。
 * 保護者と子どもが見る画面なので、事務システムらしい硬さを弱める。
 * 丸ゴシック（Zen Maru Gothic / M PLUS Rounded 1c）まで行くと、
 * 金額と未納を扱う画面には軽すぎる。
 *
 * subsets に "japanese" は指定できない（next/font が受け付けない）。
 * Google Fonts 側が unicode-range で分割配信するので、実際に使う字だけが
 * 落ちてくる。日本語は分割数が多く preload できないため false にする。
 */
const jpSans = Zen_Kaku_Gothic_New({
  variable: "--font-jp",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${jpSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
