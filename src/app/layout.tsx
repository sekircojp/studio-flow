import type { Metadata } from "next";
import { Geist, Geist_Mono, Zen_Maru_Gothic } from "next/font/google";
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
 * 丸ゴシック。保護者と子どもが見る画面なので、事務システムらしい硬さを
 * 弱める。英数字は Geist のままにしてあるので、金額・時刻・回収率の
 * 見た目は変わらない。丸くなるのはかなと漢字だけ。
 *
 * subsets に "japanese" は指定できない（next/font が受け付けない）。
 * Google Fonts 側が unicode-range で分割配信するので、実際に使う字だけが
 * 落ちてくる。日本語は分割数が多く preload できないため false にする。
 */
const jpSans = Zen_Maru_Gothic({
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
