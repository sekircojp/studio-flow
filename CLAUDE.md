# Studio Flow

ダンススタジオ向けのスクール運営管理 SaaS。運営は合同会社セキレイ。

設計書: @docs/studio-flow-design.md

作業を始める前に必ず設計書を読むこと。本ファイルと設計書が矛盾する場合は設計書を優先する。

## 技術構成

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 / lucide-react / recharts
- Supabase (PostgreSQL / RLS / Storage / Edge Functions / pg_cron)
- 認証: Supabase Auth のメール確認コード方式（パスワード不要）
- Vercel（main への push で自動デプロイ）
- メール: Resend

## 絶対条件

- organizations 以外の全業務テーブルに organization_id を必須列で持たせる
- 全テーブルで RLS を有効化する
- アプリ層でも必ず organization_id で絞り込む。RLS は保険であって一次防御ではない
- Super Admin は /superadmin/* に分離し、スタジオ管理 /admin/* と混在させない
- クライアント側のロール切替は実装しない。ロールはサーバーセッションから決定する
- 日時は timestamptz で UTC 保存、表示は Asia/Tokyo 固定
- 金額は税込・整数（円）で保持し、税率を併せて持つ。浮動小数点は使わない
- データの物理削除はしない。状態変更で表現する

## スコープ

実装は設計書 9章の**フェーズ1のみ**。

設計書 9.1「やらないこと」に挙がっている機能には着手しない。
必要そうに見えても、勝手に作らないこと。判断に迷ったら質問する。

## 既存プロダクトからの流用

MarcheBase（sekircojp/marchebase）に稼働実績のある実装がある。
認証、メール送信（Edge Function + Resend）、定期実行（pg_cron）は
ゼロから書かず、既存実装を参照して移植する。

MarcheBase のフォルダを参照する場合、そちらのファイルは絶対に変更しないこと。

## 進め方

- 一度に大量のファイルを作らず、機能単位で区切って進める
- 各段階で何を作ったか、次に何が必要かを日本語で説明する
- 専門用語を使う場合は簡単な補足をつける
