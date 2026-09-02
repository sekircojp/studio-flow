# sekir.co.jp の DNS 設定メモ

Studio Flow のメール送信（Resend）でドメイン認証を行うにあたり、
DNS を触る前の状態を控えたもの。**作業前の状態がこれ。**

取得日: 2026-09-02（`Resolve-DnsName ... -Server 8.8.8.8` で確認）

## 変更前の状態

| 種別 | 名前 | 値 | 備考 |
| --- | --- | --- | --- |
| NS | sekir.co.jp | `uns01.lolipop.jp` / `uns02.lolipop.jp` | ロリポップ標準。レコードを自由に追加できない |
| A | sekir.co.jp | `118.27.125.234` | ロリポップのサーバー。**サイトの表示** |
| A | www | `118.27.125.234` | 同上 |
| MX | sekir.co.jp | `10 mx01.lolipop.jp` | **会社のメール受信。消すと take@sekir.co.jp が死ぬ** |
| TXT | sekir.co.jp | `v=spf1 include:_spf.lolipop.jp ~all` | ロリポップからの送信を許可する SPF |

ドメインの登録: お名前.com
DNS の管理: ロリポップ（ネームサーバーがロリポップを向いている）
サーバー・メール: ロリポップ

## Resend のために追加が必要なレコード

`sekir.co.jp` の Resend ドメイン設定（status: Not Started）に表示されるもの。
値は Resend の画面からコピーする（画面上は省略表示されている）。

| 種別 | 名前 | 値 | 優先度 |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqG...`（DKIM 公開鍵） | — |
| MX | `send` | `feedback-smtp.<region>.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:...amazonses.com ~all` | — |

### 既存設定との関係

- 追加する MX は **`send.sekir.co.jp`** に対するもの。
  ルートの MX（`mx01.lolipop.jp`）とは別階層なので**共存する**
- 追加する SPF も `send.sekir.co.jp` に対するもの。
  ルートの SPF（ロリポップ）とは別なので**書き換えない**
- DKIM は `resend._domainkey` という専用の名前。既存と衝突しない

**ルートの A / MX / TXT は変更しないこと。**

## ロリポップの制約

ロリポップ標準のネームサーバーでは、TXT や MX を自由に追加できない。
管理画面（サーバーの管理・設定 → 独自ドメイン設定）はドメインの割り当てと
公開フォルダの指定のみ。

回避策の候補:

1. **ムームーDNS へ移行**（ロリポップの左メニューに導線あり）
2. **お名前.com の DNS を使う** — ネームサーバーをお名前.comに戻し、
   上記の既存4件を手で作り直したうえで Resend の3件を足す
3. **Cloudflare（無料）に DNS を移す** — 既存レコードを自動で読み取ってくれる

いずれもネームサーバーの切り替えを伴うため、**上の「変更前の状態」を
必ず復元できる状態で作業すること。**
