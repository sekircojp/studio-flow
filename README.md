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
public/               静的ファイル（ロゴは Supabase Storage 側に置く）
src/app/              App Router
```

## データベース

Supabase プロジェクトに接続してマイグレーションを適用する。

```bash
npx supabase login
npx supabase link --project-ref <プロジェクトの ref>
npx supabase db push
```

`supabase db push` は `supabase/migrations/` の SQL を古い順に適用する。
適用済みのファイルは編集せず、必ず新しいファイルを追加すること。

| ファイル | 内容 |
| --- | --- |
| `20260901000100_tenant_foundation.sql` | organizations / memberships / super_admins / brand_settings / locations / rooms |
| `20260901000200_tenant_foundation_rls.sql` | 上記テーブルの RLS ポリシー |

ローカルでの `supabase start` は Docker が必要。未導入の場合はリモートの
Supabase プロジェクトに直接 push する。

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
