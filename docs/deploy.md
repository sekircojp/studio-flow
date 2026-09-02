# デプロイ手順

Vercel へのデプロイと、本番で切り替える設定の一覧。

対象: Studio Flow（Next.js 16 / Supabase）
Supabase プロジェクト: `studio-flow`（ref: `fterpqyvzeqcaltfkpuc` / Tokyo）

---

## 1. GitHub リポジトリ

Vercel は Git リポジトリを見て自動デプロイする（設計書 2章）。
**main への push で本番が更新される**ので、main に入れるものは検証済みに限る。

```bash
gh repo create sekircojp/studio-flow --private --source=. --push
```

`.gitignore` で `.env*` を除外しているため、鍵はリポジトリに入らない。
`.env.example` だけが入る（`!.env.example` で除外を打ち消している）。

## 2. Vercel でプロジェクトを作成

1. https://vercel.com で GitHub リポジトリを Import
2. Framework Preset は **Next.js**（自動検出される）
3. Build Command / Output Directory は既定のまま
4. **Environment Variables** に以下を登録してから Deploy

| 変数名 | 値 | 対象環境 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fterpqyvzeqcaltfkpuc.supabase.co` | Production / Preview / Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の Publishable key | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の Secret key | 同上 |
| `NEXT_PUBLIC_SITE_URL` | デプロイ後のURL（例 `https://studio-flow.vercel.app`） | 同上 |

`SUPABASE_ACCESS_TOKEN` と `RESEND_API_KEY` は**登録しない**。
前者は開発用の CLI トークン、後者は Supabase の Edge Function 側で使うもの。

**`SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` を付けないこと。**
付けるとブラウザに配られ、全テナントのデータが読める鍵が漏れる。

## 3. デプロイ後に切り替える設定

URL が確定してから行う。忘れるとログインができない。

### 3.1 Supabase の Auth 設定

ダッシュボード → Authentication → URL Configuration

- **Site URL**: デプロイ後のURL
- **Redirect URLs**: デプロイ後のURL

### 3.2 Edge Function のシークレット

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase secrets set --project-ref fterpqyvzeqcaltfkpuc \
  ALLOWED_ORIGIN="http://localhost:3000,https://<本番URL>" \
  PUBLIC_SITE_URL="https://<本番URL>"
```

`ALLOWED_ORIGIN` は**カンマ区切りで複数指定できる**。localhost を残しておくと
開発を続けられる。ここを本番URLだけにすると、ローカルからログインできなくなる。

### 3.3 メールの差出人

送信ドメインの認証が済んだら切り替える（設計書 11章）。

```bash
npx supabase secrets set --project-ref fterpqyvzeqcaltfkpuc \
  MAIL_FROM="Studio Flow <noreply@sekir.co.jp>"
```

認証が済むまでは `onboarding@resend.dev` のままで、
**Resend アカウントの持ち主のアドレス宛にしか届かない。**

## 4. 独自ドメイン（app.sekir.co.jp）

設計書 2章では `sekir.co.jp` のサブドメインで公開する想定。

1. Vercel の Project → Settings → Domains に `app.sekir.co.jp` を追加
2. 表示された CNAME を DNS に登録
3. 反映後、上記 3.1〜3.3 の URL を独自ドメインに変更

DNS の管理場所については [dns-sekir-co-jp.md](dns-sekir-co-jp.md) を参照。

---

## 未対応の項目

| 項目 | 状態 |
| --- | --- |
| 請求の月次自動生成（pg_cron） | ✅ 毎日 UTC 0時（JST 朝9時）に起動し、JST で1日のときだけ生成 |
| 振替権の期限切れ処理（pg_cron） | ✅ 同じ時刻に毎日実行 |
| メール配信結果の追跡（sync-mail-delivery） | 未移植 |
| Super Admin 画面 | フェーズ1では作らない。DB に直接入れる（設計書 9.1） |
| 入金済み請求の編集禁止 | ✅ DB のトリガで実装。service_role からも書き換えられない |
