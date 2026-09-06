# 独自ドメインの設定手順

Studio Flow 用のドメインを取得したあとに行う作業。
これを終えると、**メール送信の制限と公開URLの2つが同時に解決する。**

## なぜ必要か

いま詰まっているのは1点だけ。**DNS レコードを自由に追加できないこと。**

- `sekir.co.jp` のネームサーバーはロリポップ（`uns01.lolipop.jp`）を向いている
- ロリポップ標準の DNS は TXT / MX を自由に追加できない
- Cloudflare へ移そうとしたが、お名前.com側が操作を制限している（2026-09-02 時点で問い合わせ中）

Studio Flow 用のドメインを新規に取れば、この経路をすべて迂回できる。

設計書 11章でも「送信ドメインは Studio Flow 側で固定する」となっており、
MarcheBase が `marchebase.jp` を持っているのと同じ形になる。

## 取得先

**お名前.comでは取らないこと。** 現在の制限と同じ問題を踏む可能性がある。

| 候補 | 特徴 |
| --- | --- |
| Cloudflare Registrar | DNS が最初から自由。原価販売。`.jp` は非対応 |
| ムームードメイン | ムームーDNS が使える。`.jp` も可。GMOペパボ |

---

## 作業手順

### 1. DNS を Cloudflare に置く

ムームードメインで取った場合も、DNS だけ Cloudflare に向けると以後が楽になる。
（ムームーDNS のままでも可。その場合は各レコードをムームーDNS に入れる）

### 2. Resend でドメインを認証

1. https://resend.com/domains → **Add Domain**
2. Region は **Tokyo (ap-northeast-1)**
3. 表示される3件を DNS に登録

| 種別 | 名前 | 内容 |
| --- | --- | --- |
| TXT | `resend._domainkey` | DKIM 公開鍵 |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com`（優先度 10） |
| TXT | `send` | `v=spf1 include:...amazonses.com ~all` |

4. **Verify** を押して `Verified` になれば完了

### 3. 差出人を切り替える

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase secrets set --project-ref fterpqyvzeqcaltfkpuc \
  MAIL_FROM="Studio Flow <noreply@新しいドメイン>"
```

これで**任意のアドレスに確認コードが届く**ようになる。
保護者・講師アカウントのログイン確認ができるのはここから。

### 4. Vercel に独自ドメインを追加

1. Vercel の Project → Settings → **Domains** → `app.新しいドメイン` を追加
2. 表示された CNAME を DNS に登録
3. 証明書の発行を待つ（数分）

### 5. URL の切り替え

独自ドメインが有効になったら、3か所を直す。**どれか1つでも忘れるとログインできない。**

**① Vercel の環境変数**

`NEXT_PUBLIC_SITE_URL` を `https://app.新しいドメイン` に変更 → **Redeploy**
（環境変数はビルド時に埋め込まれるため、再デプロイしないと反映されない）

**② Supabase の Auth 設定**

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
curl -s -X PATCH "https://api.supabase.com/v1/projects/fterpqyvzeqcaltfkpuc/config/auth" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"site_url":"https://app.新しいドメイン","uri_allow_list":"http://localhost:3000,http://localhost:3000/**,https://app.新しいドメイン,https://app.新しいドメイン/**"}'
```

**③ Edge Function のシークレット**

```bash
npx supabase secrets set --project-ref fterpqyvzeqcaltfkpuc \
  ALLOWED_ORIGIN="http://localhost:3000,https://app.新しいドメイン" \
  PUBLIC_SITE_URL="https://app.新しいドメイン"
```

`ALLOWED_ORIGIN` から **localhost を消さないこと。** 消すとローカル開発でログインできなくなる。

### 6. 保護者アカウントで確認

メールが任意のアドレスに届くようになるので、ここで初めて確認できる。

- 保護者としてログインし、`/my` が自世帯だけを表示するか
- `/admin` を直接叩くと弾かれるか

テスト用の保護者 `佐藤ゆき` のメールアドレスは `sato@example.com`（架空）のままなので、
受信できるアドレスに変更してから試すこと。

---

## 現状（2026-09-02）

| 項目 | 状態 |
| --- | --- |
| アプリ本体 | ✅ フェーズ1完了 |
| GitHub | ✅ sekircojp/studio-flow（private） |
| Vercel 本番 | ✅ https://studio-flow-iota.vercel.app |
| Supabase | ✅ 本番稼働 |
| オーナーのログイン | ✅ 本番で確認済み |
| メール送信 | ⚠️ `take@sekir.co.jp` 宛のみ（Resend のテストモード） |
| 保護者・講師のログイン | ⏸ 上記の制限により未確認 |
| 独自ドメイン | ⏸ 未取得 |

## 取得後に片付ける宿題（2026-09-06 時点）

- **請求のお知らせメールの実地確認。** 仕組みは完成していて、本番で送信までは
  確認済み（`deliveries` に `sent` が残る）。保護者の実アドレス宛に届くことの
  確認だけが残っている
- **Vercel の `NEXT_PUBLIC_SITE_URL`** が仮値 `https://studio-flow.vercel.app`
  のまま。取得したドメインに直す
- 講師・保護者のテスト用アドレス（`maya@example.com` など）に届かないため、
  手元では `DEV_LOGIN=1` の開発用ログインで画面を確認している。実アドレスに
  差し替えられるようになったら、この迂回は不要になる
