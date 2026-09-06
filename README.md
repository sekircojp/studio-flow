# Studio Flow

ダンススタジオ向けのスクール運営管理 SaaS。運営: 合同会社セキレイ。

設計書: [docs/studio-flow-design.md](docs/studio-flow-design.md)
実装ルール: [CLAUDE.md](CLAUDE.md)

## 技術構成

| 領域 | 採用 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) + React 19 |
| 言語 | TypeScript |
| CSS | Tailwind CSS v4 |
| UI 補助 | lucide-react（アイコン）、recharts（グラフ） |
| DB / 認証 / Storage | Supabase（PostgreSQL + RLS） |
| サーバー処理 | Supabase Edge Functions (Deno) |
| 定期実行 | pg_cron + pg_net |
| メール | Resend（Edge Function 経由） |
| ホスティング | Vercel（main への push で自動デプロイ） |

## セットアップ

```bash
npm install
cp .env.example .env.local   # 値を埋める
npm run dev
```

http://localhost:3000 を開く。

### 環境変数

`.env.example` を参照。`SUPABASE_SERVICE_ROLE_KEY` は RLS をバイパスするため、
サーバー側でのみ使用し、`NEXT_PUBLIC_` を付けないこと。

Resend の API キーは Next.js 側ではなく、Supabase Edge Function のシークレットに設定する。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | ビルド済みアプリの起動 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（`tsc --noEmit`） |

## ディレクトリ

```
docs/                 設計書
supabase/migrations/  DB マイグレーション（SQL）
supabase/functions/   Edge Functions（Deno。Next.js の型検査対象外）
public/               静的ファイル（ロゴは Supabase Storage 側に置く）
src/app/              App Router
src/lib/supabase/     Supabase クライアント（client / server / admin）
src/lib/auth/         セッションとロールの判定
src/proxy.ts          セッション更新（Next.js 16 で middleware から改称）
```

## データベース

マイグレーションは `supabase/migrations/` に置く。適用状況は
[supabase/migrations/APPLIED.md](supabase/migrations/APPLIED.md) で管理する。

MarcheBase と同じく、Supabase ダッシュボードの **SQL Editor** に貼り付けて
上から順に実行する。適用したら APPLIED.md を必ず更新すること。

適用済みのファイルは編集しない。修正が必要なら新しいファイルを追加する。

## サービス名

画面に出すサービス名は **[src/config/app.ts](src/config/app.ts) の1か所だけ**で定義する。
各画面に直接書かないこと。名称が決まったら、このファイルを書き換えれば全画面に反映される。

```ts
export const APP_NAME = "Studio Flow";  // 仮称
```

**メールの差出人名だけは別**。Edge Function は Deno という別の実行環境で動き、
このファイルを読めないため、Supabase のシークレットで設定する。

```bash
npx supabase secrets set --project-ref fterpqyvzeqcaltfkpuc   MAIL_FROM="新しいサービス名 <noreply@ドメイン>"
```

スタジオ名が設定されているテナントでは、差出人名はそちらが優先される（設計書 11章）。

なお「サービス名」と「スタジオ名」は別物。前者はこの SaaS の名前で全テナント共通、
後者は契約したスタジオごとの値で `brand_settings` に入っている。

## 認証

メール確認コード方式（パスワード不要・設計書 2章）。MarcheBase から移植した。

```
1. ログイン画面でメールアドレスを入力
2. Edge Function send-verification-code が6桁を発行し、Resend で送信
   （コードは平文で保存せず、sha256 のハッシュだけを DB に置く）
3. 届いたコードを入力
4. Edge Function verify-code が照合し、magic link のトークンを返す
5. ブラウザが verifyOtp してセッションを Cookie に確立する
```

セッションは **Cookie** に置く（MarcheBase は localStorage）。設計書 3章の
「ロールはサーバーセッションから決定する」を満たすには、サーバー側から
セッションを読める必要があるため。`@supabase/ssr` を使う。

### Edge Function のデプロイ

```bash
npx supabase functions deploy send-verification-code
npx supabase functions deploy verify-code
npx supabase functions deploy send-invoice-notice
npx supabase functions deploy send-trial-notice
```

`supabase link` を通していない場合は、`--project-ref <ref>` を付けて
`SUPABASE_ACCESS_TOKEN` を環境変数で渡す。

### Edge Function のシークレット

Next.js の `.env.local` ではなく、Supabase 側に設定する。
ダッシュボードの Edge Functions → Secrets、または以下のコマンド。

```bash
npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="Studio Flow <noreply@example.com>" ALLOWED_ORIGIN=http://localhost:3000 PUBLIC_SITE_URL=http://localhost:3000
```

| 名前 | 用途 |
| --- | --- |
| `RESEND_API_KEY` | Resend の API キー |
| `MAIL_FROM` | 送信元アドレス。表示名はスタジオ名で上書きされる（設計書 11章） |
| `ALLOWED_ORIGIN` | CORS の許可元。カンマ区切りで複数可。`*` は開発時のみ |
| `PUBLIC_SITE_URL` | メール本文のリンクに使う URL |

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で渡すため、
設定は不要。

## 開発上の絶対条件

設計書 3 章のとおり、マルチテナントの前提を崩さないこと。

- `organizations` 以外の全業務テーブルに `organization_id` を必須列で持たせる
- 全テーブルで RLS を有効化する
- アプリ層でも必ず `organization_id` で絞り込む（RLS は保険であって一次防御ではない）
- Super Admin は `/superadmin/*` に分離する
- 日時は `timestamptz` で UTC 保存、表示は `Asia/Tokyo` 固定
- 金額は税込・整数（円）で保持し、税率を併せて持つ
- データの物理削除はしない。状態変更で表現する

## スコープ

設計書 9 章のフェーズ1のみ。9.1「やらないこと」には着手しない。
