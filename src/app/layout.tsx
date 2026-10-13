import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";

/**
 * 書体は Noto Sans JP に全画面で統一する（2026-10-13）
 *
 * 以前は英数字に Geist、日本語に OS 標準や丸ゴシックを混ぜていたが、欧文専用の
 * 個性の強い書体と日本語を混ぜると字面がちぐはぐになり、Windows では
 * 「游ゴシック UI」に落ちて細く安っぽく見えた。業務 SaaS として広く使われる
 * Noto Sans JP を webfont で配り、OS によらず同じ見た目にする。
 *
 * subsets に "japanese" は指定できない（next/font が受け付けない）。
 * Google Fonts 側が unicode-range で分割配信するので、実際に使う字だけが
 * 落ちてくる。分割数が多く preload できないため false にする。
 */
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto",
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
      className={`${notoSansJp.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
