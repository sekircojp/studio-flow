# Studio Flow 実装設計書

作成日: 2026-08-31
更新日: 2026-09-01（既存プロダクト MarcheBase の構成に合わせて確定）
対象: ダンススタジオ向けスクール運営管理 SaaS
運営者: 合同会社セキレイ

---

## 0. この文書の位置づけ

本書は、Studio Flow をゼロから実装するにあたっての**確定した設計判断**をまとめたものである。要件書（機能一覧）とは役割が異なり、本書は「どう作るか」を定める。

矛盾がある場合、本書が優先する。

---

## 1. スコープ

### 1.1 対象業種

「スタジオ」と名のつく業態に限定する。

- 対象: ダンス、バレエ、ヨガ、ピラティス、音楽、フィットネス
- **対象外: 学習塾、語学教室、家庭教師、パソコン教室**

対象外としたのは、これらが特定商取引法の「特定継続的役務提供」7業種に該当し、契約書面の交付義務、クーリング・オフ、中途解約時の精算計算が法的に必須となるため。この機能群を実装しない前提で設計する。

`organizations.business_type` を1フィールド持つのみとし、現段階で業種別の分岐は実装しない。

### 1.2 初期プロダクトの中核価値

**「現金でも月謝管理がきちんと回る」ことを初期の中核価値とする。**

想定顧客の大多数は現金回収で運営しており、カード決済・口座振替は例外的である。既存競合は決済自動化を訴求しているが、同じ土俵には乗らない。

「誰から今月いくら受け取ったか／受け取っていないか」が手元の帳面より速く分かる状態を、まず完成させる。

---

## 2. 技術スタック

既存プロダクト **MarcheBase**（sekircojp/marchebase）と同一構成とする。運用実績のある構成をそのまま踏襲することで、初期の不具合を減らす。

| 領域 | 採用 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) + React 19 |
| 言語 | **TypeScript**（MarcheBase は JavaScript だが、本プロダクトは新規に TypeScript とする） |
| CSS | Tailwind CSS v4 |
| UI 補助 | lucide-react（アイコン）、recharts（グラフ） |
| DB | **Supabase** / PostgreSQL / リージョン ap-northeast-1（東京） |
| 権限制御 | PostgreSQL RLS |
| ファイル保管 | Supabase Storage（ロゴ等） |
| サーバー処理 | Supabase Edge Functions（Deno / TypeScript） |
| 定期実行 | pg_cron + pg_net |
| 認証 | **Supabase Auth**（メール確認コード方式。パスワード不要） |
| ホスティング | Vercel（main ブランチへの push で自動デプロイ） |
| リポジトリ | GitHub |
| 決済 | Stripe Connect (Express / ダイレクト支払い) ※フェーズ2 |
| メール | Resend |
| ドメイン | sekir.co.jp のサブドメイン（例: app.sekir.co.jp） |

### TypeScript を採用する理由

Studio Flow は月謝・割引・兄弟割・日割り・消費税・請求の状態遷移といった**金額計算を中核に持つ**。型の取り違えによる請求ミスは保護者に直接届くため、実行前に検出できる TypeScript を採用する。

MarcheBase から移植する JavaScript のコードは、TypeScript プロジェクト内にそのまま置いても動作する。Edge Functions（Deno）はもともと TypeScript のため無変換で流用できる。

### 認証方式

**Supabase Auth のメール確認コード方式**（パスワード不要）を採用する。MarcheBase で稼働実績がある。

保護者層が主要な利用者となるため、「パスワードを忘れた」という問い合わせが構造的に発生しない点を重視する。

### 2.1 日時の扱い

- DB は **`timestamptz` で UTC 保存**
- 表示・入力は **`Asia/Tokyo` 固定**
- 「日付」だけを持つ列（請求対象月、レッスン日など）は `date` 型とし、タイムゾーン変換を行わない

### 2.2 金額の扱い

- **税込金額を整数（円）で保持**する。小数・浮動小数点は使わない
- 同時に **税率（`tax_rate`）を保持**する。適格請求書には税率ごとの消費税額の記載が必要なため、税込金額だけでは領収書を発行できない
- 消費税額は税込金額と税率から算出し、保存もする（後から税率が変わっても過去の請求が再計算されないようにする）

---

## 3. マルチテナント設計

**単一DB + 全テーブルに `organization_id` + PostgreSQL の行レベルセキュリティ (RLS) 有効化。**

### 実装規約

1. `organizations` 以外の**すべての業務テーブルに `organization_id` を必須列として持たせる**
2. **すべてのテーブルで RLS を有効化**し、`organization_id` が現在のセッションのテナントと一致する行のみアクセス可能とする
3. アプリケーション層でも必ず `organization_id` で絞り込む。RLS は書き忘れに対する保険であり、一次防御ではない
4. **Super Admin は別経路**とする。RLS をバイパスする専用ロールを使い、URL 空間も分離する（`/admin/*` はスタジオ管理、`/superadmin/*` は SaaS 運営）
5. クライアント側のロール切替（デモにあったプレビュータブ）は本番に持ち込まない。ロールはサーバーセッションから決定する

---

## 4. データモデル

### 4.1 テナント・組織

```
organizations (テナント = 契約スタジオ)
  id, name, business_type, plan, status,
  custom_price, custom_price_reason, custom_price_valid_until,
  created_at

brand_settings
  organization_id, studio_name, logo_url, brand_color,
  tel, email, address, website,
  invoice_registration_number, -- 適格請求書発行事業者の登録番号（任意）
  terms, terms_updated_at      -- スタジオ規約。保護者のマイページに出す

locations (スタジオ = 場所)
  id, organization_id, name, address, tel, is_active

rooms (ルーム = その中の1室)
  id, location_id, name, capacity, display_order
```

### 画面での呼び方（2026-09-05 確定）

DB のテーブル名は `locations` / `rooms` のまま、画面の表記を次のとおりとする。

| 階層 | 画面での呼び方 | 例 |
| --- | --- | --- |
| テナント（契約者） | **スクール名** | テストダンススクール |
| locations | **スタジオ**（箱） | 岡崎スタジオ |
| rooms | **ルーム**（箱の中の部屋） | メインルーム |
| classes | **クラス**（名前の付いたレッスン） | KIDS HIPHOP 初級 |
| lessons | **レッスン**（1回ごとの開催） | 9/15(火) 16:00 の回 |

「定期クラス」とは呼ばない。単発のレッスン（スポットレッスン）はフェーズ1で
扱わないので（9.1）、「定期」で区別する必要がない。将来スポットを足すときは
そちらに別の名前を付ける。

対象を「スタジオと名のつく業態」に絞っている（1.1）ので、業種を跨ぐための
無難な言葉（店舗・拠点）ではなく、現場で実際に使われている「スタジオ」を
場所の名前にする。

テナント側を「スタジオ名」と呼ぶと場所と衝突するため、そちらは「スクール名」
とする。`brand_settings.studio_name` の列名は変更しない。

運営を終えたスタジオは `is_active = false`（画面では「閉鎖」）で表す。

**Room は必ず持つ。** 部屋が1つしかないスタジオでも Location 配下に Room を1件作る。後から2部屋目ができても構造が壊れないようにするため。

ただし**運営者に入力させない**（2026-09-05 追記）。1部屋しかないスタジオにとって「ルーム名」は存在しない概念で、必須にすると答えようがない。スタジオを登録した時点で `public.create_location()` が既定のルーム（「メインルーム」）を同じトランザクションで作る。ルームを分けているスタジオだけが、あとから名前を変えたり足したりする。

`terms` は入会案内・受講規約・キャンセル規定などの文章（2026-09-06 追加）。保護者のマイページ `/my/terms` にそのまま表示する。**同意の記録は持たない。** 対象業種を「スタジオと名のつく業態」に絞っており（1.1）、特定継続的役務提供の7業種は外してあるため、契約書面の交付義務が無く、同意日時を証拠として残す必要が現時点で無い。必要になったら規約の版と同意記録を別テーブルで足す。

`invoice_registration_number` は**任意項目**。免税事業者のスタジオが多数を占めるため、未登録なら帳票に表記を出さない。

### 4.2 期・スケジュール

```
seasons (期)
  id, organization_id, name, start_date, end_date, is_current

studio_closures (休講日マスタ)
  id, organization_id, date, name, location_id (null = 全校舎)

classes (定期クラス)
  id, organization_id, season_id, instructor_id,
  name, genre, level, target_age_min, target_age_max,
  enrollment_capacity,      -- 在籍定員
  room_capacity,            -- 1レッスンの実収容上限
  monthly_fee,              -- 税込
  accepts_new_enrollment, accepts_trial, accepts_transfer,
  is_public, description

class_meetings (開催枠)
  id, organization_id, class_id, room_id,
  day_of_week, start_time, end_time,
  is_active

lessons (開催回)
  id, organization_id, class_id, class_meeting_id, room_id, instructor_id,
  date, start_at, end_at,
  status,                   -- scheduled / held / canceled
  cancel_reason,
  has_attendance_record     -- 出欠が1件でも記録されたか
```

**クラスは週に何回開いてもよい（2026-09-04 変更）。**
曜日・時刻・部屋は `classes` ではなく `class_meetings` が持つ。

```
初級クラス（週2回レッスン） → 1 クラス ＋ 開催枠 2 件
中級クラス（週1回レッスン） → 1 クラス ＋ 開催枠 1 件
```

当初は `classes` が曜日を1つだけ持っていたが、それだと週2回のクラスが
2行に分かれ、クラス数が運営の数え方と合わなくなる。生徒が在籍する単位
（クラス）と、毎週いつどこで開くか（開催枠）は別物として扱う。

同じジャンルでも対象が違えば別クラスとする。「K-POP 幼児クラス（水）」と
「K-POP 小学生クラス（木）」は 2 クラスである。在籍する生徒が違うため。

**隔週・月1回のような周期は持たせない。** 実例が乏しいわりに生成処理が
複雑になる。例外的な回はレッスンを個別に休講・時間変更して調整する（5.1）。

開催枠に物理削除は用意しない。使わなくなった枠は `is_active = false` に
する。生成済みのレッスンが根拠を失わないようにするため。

### 4.3 生徒・保護者・世帯

```
households (世帯)
  id, organization_id, name, billing_guardian_id

guardians (保護者)
  id, organization_id, household_id, name, name_kana,
  relationship, email, tel, address, emergency_contact,
  line_user_id, is_billing_contact

students (生徒)
  id, organization_id, household_id,
  name, name_kana, birth_date, gender, grade,
  enrolled_on, status, note
  -- status: trial / active / suspended_billed / suspended_unbilled / withdrawn

student_measurements (採寸履歴)
  id, student_id, measured_at,
  height, wear_size, shoe_size, note
```

**採寸は履歴形式。** 生徒の属性として単一の値を持たない。子どもは成長するため、いつ時点の数値かが分からないと使えない。「サイズ情報の更新が必要」の判定も、最新の `measured_at` からの経過日数で行う。

生徒の在籍状態に**休会を2種類持つ**。休会費を設定した場合は請求が発生するため、「休会中（請求あり）」と「休会中（請求停止）」を区別しないとダッシュボードの件数が合わなくなる。

### 4.4 在籍・出欠・振替

```
enrollments (在籍)
  id, student_id, class_id, start_date, end_date

attendances (出欠)
  id, lesson_id, student_id,
  status,                   -- present / absent / late / unconfirmed
  recorded_by, recorded_at, note

absence_requests (欠席連絡)
  id, student_id, lesson_id, reason, submitted_at, submitted_by

transfer_credits (振替権)
  id, student_id, source_lesson_id,
  granted_at, expires_at, used_at,
  status                    -- available / used / expired / revoked

transfer_bookings (振替予約)
  id, transfer_credit_id, lesson_id, booked_at, canceled_at

waitlists (キャンセル待ち)
  id, lesson_id, student_id, position, created_at, notified_at
```

### 4.5 契約・請求・入金

要件書 9.1 のとおり、以下を**別エンティティとして厳格に分離**する。

```
料金プラン → 生徒の月謝契約 → 月ごとの請求 → 決済 → 入金結果
```

```
pricing_plans (料金プラン)
  id, organization_id, name,
  monthly_amount,           -- 税込
  tax_rate,
  enrollment_fee, annual_fee, registration_fee,
  applies_from, is_public

student_contracts (月謝契約)
  id, student_id, pricing_plan_id,
  monthly_amount,           -- プランから複写。個別変更を許容
  payment_method,           -- cash / bank_transfer / card / other
  start_date, end_date,
  status,                   -- active / suspended_billed / suspended_unbilled / ended
  suspend_from, suspend_to

invoices (月次請求)
  id, organization_id, student_id,
  billing_month,            -- date (月初日)
  subtotal, discount_total, total, tax_rate, tax_amount,
  due_date,
  status,                   -- draft / issued / paid / partially_paid
                            -- / payment_failed / awaiting_confirmation
                            -- / canceled / suspended
  issued_at, canceled_at, cancel_reason

invoice_items (請求明細)
  id, invoice_id, kind, description, amount
  -- kind: tuition / discount / enrollment_fee / spot / event
  --       / costume / other

payments (入金)
  id, invoice_id, method, amount, paid_at,
  recorded_by, note, stripe_payment_intent_id

refunds (返金)
  id, payment_id, amount, refunded_at, reason, recorded_by
```

**請求の状態は6つ以上を明示的に持つ。** 「支払済／未納」の2分割にすると、入金確認待ちや休会中請求停止が契約件数と合わなくなる。ダッシュボードでは全状態の合計＝請求対象契約件数で閉じること。

### 4.6 見込み顧客・体験・スポット・イベント

```
leads (見込み顧客)
  id, organization_id, name, guardian_name, tel, email,
  desired_class_id, status, last_contacted_at, note
  -- status: inquiry / trial_booked / trial_done
  --         / considering / enrolled / declined

trials (体験・見学)
  id, organization_id, lead_id, lesson_id,
  kind,                     -- trial / observation
  student_name, guardian_name, tel, email,
  status, intent, note

spot_lessons
  id, organization_id, room_id, instructor_id,
  title, start_at, end_at, capacity,
  member_price, non_member_price,
  accepts_non_member, accepts_waitlist,
  application_opens_at, application_closes_at,
  cancel_deadline_at, refund_rate_within_deadline,
  is_public, description, image_url

spot_bookings
  id, spot_lesson_id, student_id, lead_id,
  amount, status, booked_at, canceled_at

events
  id, organization_id, title, venue, start_at, end_at,
  capacity, price, cancel_deadline_at,
  refund_rate_within_deadline, is_public

event_entries
  id, event_id, student_id, amount, status, entered_at
```

### 4.7 講師・報酬

```
instructors
  id, organization_id, user_account_id,
  name, name_kana, tel, email, is_active

compensation_rules
  id, instructor_id, kind, amount, rate, applies_from
  -- kind: per_lesson / per_student / revenue_share
  --       / monthly / hourly / fixed

monthly_compensations
  id, instructor_id, target_month,
  amount, status, calculation_detail (jsonb)
  -- status: calculating / confirmed / paid
```

講師1名に複数の `compensation_rules` を紐づけられる構造とする。月給制でもスポット歩合や代講を加算できるようにするため。

### 4.8 通知

```
notifications
  id, organization_id, kind, subject, body, target_filter (jsonb)

notification_preferences
  id, guardian_id, channel_priority, kind, enabled

deliveries
  id, notification_id, guardian_id, channel,
  status, sent_at, error
  -- channel: email / line / in_app
```

**「何を誰に通知するか」と「どの手段で送るか」を分離する。** LINE 未連携の保護者にはメールへ自動フォールバックする。LINE 連携がなくても全機能が使えることを必須とする。

### 4.9 SaaS 運営・監査

```
saas_subscriptions
  id, organization_id, plan, monthly_price,
  trial_ends_at, started_at, canceled_at

feature_flags
  id, organization_id, key, enabled

audit_logs
  id, organization_id, actor_id, action,
  target_type, target_id, before (jsonb), after (jsonb), created_at
```

---

## 5. 主要ロジック仕様

### 5.1 レッスン一括生成

```
入力: season_id, class_id (または全クラス)
処理:
  1. season の start_date 〜 end_date を走査
  2. クラスの有効な開催枠ごとに、その day_of_week に一致する日を抽出
  3. studio_closures に該当する日を除外
  4. lessons を生成 (status = scheduled)
出力: 生成件数、除外された休講日の一覧
```

週2回のクラスなら開催枠を2周する。同じクラスが同じ日に2回開かれることも
ありうるため、レッスンの一意制約は `(class_id, date, start_at)` とする。

**再生成の禁止ルール（重要）**

`has_attendance_record = true` のレッスンは、再生成・一括削除の対象から**必ず除外する**。クラスの曜日を変更して再生成した際に、出欠記録済みのレッスンが消えることを防ぐ。

**欠席連絡・振替予約・振替権の発生元・キャンセル待ちが付いたレッスンも同様に除外する**（2026-09-04 追記）。これらはレッスンへの外部キーを持つため、削除しようとすると再生成そのものが失敗する。加えて、運営や保護者の操作が乗っている回であり、出欠記録済みと同じ扱いが正しい。

**個別変更**

生成後、レッスン単位で以下を変更できる。

- 休講にする（`status = canceled` + 理由）
- 時間を変更する
- 部屋を変更する
- 講師を変更する（代講）

休講にしたレッスンは、保護者ビューのカレンダーに休講として表示される。個別連絡を不要にするため。

### 5.2 定員判定

クラスは定員を**2つ**持つ。

| 数値 | 意味 | 判定対象 |
| --- | --- | --- |
| `enrollment_capacity` | 在籍定員 | 新規入会の可否 |
| `room_capacity` | 1レッスンの実収容上限 | 体験・振替の受入可否 |

```
新規入会可否:
  現在の在籍数 < enrollment_capacity
  AND accepts_new_enrollment = true

体験受入可否:
  (そのレッスンの在籍数 + 体験数 + 振替数) < room_capacity
  AND accepts_trial = true

振替受入可否:
  (そのレッスンの在籍数 + 体験数 + 振替数) < room_capacity
  AND accepts_transfer = true
```

在籍が満席でも、実収容上限までは体験・振替を受け入れられる。同時に、部屋の物理的なキャパシティを超えることもない。

### 5.3 振替ルール（組織ごとの設定値）

以下6つのパラメータで表現する。ルールエンジンは実装しない。

| 設定 | 例 |
| --- | --- |
| 欠席連絡の期限 | レッスン開始の 2 時間前まで |
| 振替権の有効期限 | 発生から 60 日 / 3か月 / 当月内 / 期内 |
| 上限回数 | 月 2 回まで |
| 振替先の範囲 | 同一クラスのみ / 同ジャンル / 全クラス |
| 振替回の欠席時 | 権利を戻す / 戻さない |
| 無断欠席 | 振替権を与える / 与えない |

### 5.4 月次請求の生成

実装は **pg_cron + pg_net**（MarcheBase の定期実行と同じ仕組み）で行う。

```
毎月の生成バッチ:
  1. status が active または suspended_billed の student_contracts を抽出
  2. 各契約について当月の invoice を作成 (status = draft)
     - suspended_billed → 休会費の金額を使用
     - suspended_unbilled → invoice を作成しない
  3. 兄弟割を適用 (5.5)
  4. その他の個別割引を適用
  5. 合計・消費税額を確定
  6. status = issued へ
```

途中入会・途中退会の日割り計算方法は、組織設定でマスタ登録する。

### 請求のタイミング（2026-09-06 追記）

対象月に対して、いつ請求を作るかを組織ごとに持つ。

| 設定 | 意味 | 例 |
| --- | --- | --- |
| `issue_month_offset` | -1 前月 / 0 当月 / +1 翌月 | 0（大多数） |
| `issue_day` | 作る日（1〜28） | 1 |
| `issue_on_month_end` | true なら日付を無視して末日 | false |
| `due_day` / `due_on_month_end` | 支払期限。同じ考え方 | 27 |

対象月 = `date_trunc('month', 実行日) - issue_month_offset か月`。

**「末日」は日付の数字では表せない。** 30 と書くと2月に来ない。31 なら4月にも
来ない。真偽値で別に持つ。支払期限の「月末払い」は実務で多いので、そちらにも
用意する。

**締め日は持たない。** 締め日が要るのは、月内の実績で金額が変わるとき
（回数制・スポット・物販）。フェーズ1は定額の月謝だけなので（9.1）、締める
対象が無い。「翌月に請求」を選んでも、金額は契約の定額であって実績集計では
ない。スポットや物販を入れる段になったら、そこで初めて締め日を設計する。

### 5.5 兄弟割

請求は**生徒単位**。ただし割引の判定は世帯単位で行う。

```
設定項目:
  - 対象: 2人目のみ / 2人目以降全員
  - 割引: 定額 (円) または 率 (%)
  - 休会中の生徒を人数に数えるか: はい / いいえ (既定: はい)

処理:
  1. 同一世帯の対象生徒を月謝の高い順に並べる
  2. 設定に従い、2人目以降の invoice に割引明細を追加
```

「休会中を数えない」設定にすると、兄が休会した瞬間に弟の割引が消える。既定は「数える」とする。

### 5.6 請求の訂正・取消

| 請求の状態 | 可能な操作 |
| --- | --- |
| draft（未送付） | 自由に編集 |
| issued（送付済・未入金） | 編集可。変更履歴を `audit_logs` に記録 |
| paid（入金済） | **編集不可。** 取消（`canceled`）＋返金記録で対応 |

物理削除は行わない。すべて状態変更で表現する。

### 5.6.1 物理削除の唯一の例外: 実績のない校舎（2026-09-02 追記）

運営判断として、**登録を間違えた校舎に限り物理削除を認める。**

閉校した校舎は従来どおり `is_active = false` で表し、行は残す。過去のレッスン・
出欠・請求の根拠になるため。

削除できるのは、参照が1件も無い校舎だけとする。校舎を消すと

```
校舎 → 部屋 → クラス → レッスン → 出欠
```

が芋づるで消えることになり、「校舎の情報だけ消して、それ以外のデータは残す」
という意図と正反対の結果になる。

実装は `public.delete_location()` に閉じる。部屋と校舎を同一トランザクションで
削除し、外部キーに阻まれた場合は部屋の削除ごと巻き戻る。`authenticated` には
`delete` 権限を与えず、この関数の中でのみ削除できる。関数内で呼び出し元の
ロールを検査する。

**この例外は校舎だけに適用する。** 他のテーブルには広げない。

### 5.7 返金・キャンセル規定

月謝ではなく、スポットレッスン・イベント等の前払い商品に適用する。

```
組織の既定値:
  - キャンセル受付期限 (例: 前日 23:59)
  - 期限内の返金率 (例: 100% / 手数料を引いて 90%)
  - 期限後: 返金なし

個別のスポット・イベントで上書き可能とする。
```

**初期実装では、実際の返金操作は管理者の手動とし、システムは記録のみを行う。** Stripe API 経由の自動返金は後回しでよい。

---

## 6. 決済

### 6.1 スキーム

**Stripe Connect / Express / ダイレクト支払い。**

- 各スタジオが Stripe の**加盟店（merchant of record）**となる
- 資金はセキレイの口座を**一度も経由しない**
- 手数料支払人 = 連結アカウント（スタジオ負担）
- アプリケーション手数料 = **0（初期）**

**アカウントタイプと手数料支払人は Stripe アカウント作成時に決まり、後から変更できない。** 上記で確定とする。

### 6.1.1 現状と着手時期

MarcheBase は Stripe を一切利用していないため、**Stripe アカウントの新規開設からの着手**となる（合同会社セキレイ名義）。

**Connect の有効化には Stripe の審査がある。** 事業内容の説明を求められ、即日では通らない。フェーズ2で決済に着手する予定の **1〜2か月前には申請を出しておく**こと。

`organizations` に `application_fee_rate` を持たせておく。将来、流通額連動の収益化に切り替える場合は 0 以外を入れるだけで移行できる。

### 6.2 初期スコープ外

- **口座振替**: 自前実装は不可。収納代行会社との別契約が必要。初期対象外
- **カード自動決済**: スタジオが必要とした時点で任意有効化。初期は必須にしない

### 6.3 手動入金

初期の主経路。管理者が現金・銀行振込を受け取り、`payments` に手動登録する。この経路だけで月謝管理が完結することを必須要件とする。

---

## 7. 権限

| ロール | 経路 | 範囲 |
| --- | --- | --- |
| Super Admin | `/superadmin/*` | 全テナント。RLS バイパス |
| オーナー | `/admin/*` | 自テナントの全機能 |
| スタッフ | `/admin/*` | 権限テンプレート＋個別権限、担当店舗 |
| 講師 | `/staff/*` | 担当レッスン、出欠、生徒一覧。売上・報酬・未納は非表示 |
| 保護者 | `/my/*` | 自世帯のみ |
| 成人生徒 | `/my/*` | 自身のみ |

未成年の生徒はログインユーザーにしない。保護者アカウントから操作する。

ログインは全ロール共通で **Supabase Auth のメール確認コード方式**（パスワード不要）。ロールはサーバーセッションから決定し、ログイン後の遷移先を出し分ける。

**画面表示の制御だけでなく、API/サーバーアクション側で必ず認可する。** 直接 URL を叩いても越権できないこと。

---

## 8. 課金モデル（SaaS 側）

| プラン | 価格 | 条件 |
| --- | --- | --- |
| FREE | 0 円 | 在籍生徒 10 名まで |
| STANDARD | 4,980 円 / 月 | 上限なし |

**ワンプライス。** 段階課金は実装しない（人数カウント、プラン変更UI、日割り、上限到達時の挙動が不要になる）。

知人向けの特別価格は、Super Admin の**個別契約価格**で対応する。

```
個別価格の運用ルール:
  - 適用期間を必ず設定する
  - 内部理由を必須入力とする
  - 割引理由・内部メモはスタジオ側に絶対に表示しない
```

生徒数のカウントは**在籍のみ**（休会・退会・体験は含めない）。判定は月末時点。管理画面に「現在のカウント対象：◯名」を常時表示する。

上限到達時は既存データを読めなくせず、**新規登録のみを制限**する。

---

## 9. フェーズ1のスコープ

以下のみを実装する。

1. 認証・権限・テナント分離（RLS 含む）
2. 組織・ブランド設定・Location・Room
3. 期（Season）・休講日マスタ
4. 生徒・保護者・世帯・採寸履歴
5. 定期クラス・レッスン一括生成・カレンダー表示
6. 出欠登録（講師のスマートフォン優先）
7. 欠席・振替
8. 料金プラン・月謝契約・月次請求・手動入金・未納管理
9. ダッシュボード（第一表示＝今月の月謝）
10. 保護者マイページ（スケジュール、欠席、振替、月謝確認）

### 9.1 フェーズ1で「やらないこと」

以下は明示的に実装しない。着手しかけたら止めること。

- カード自動決済・口座振替
- LINE 連携
- 体験・見学の公開申込フォーム、WEB 入会
- 見込み顧客管理
- スポットレッスン・イベント・チケット販売
- 講師報酬の自動計算
- ~~CSV 移行~~（2026-09-06 実装。移行が必要な引き合いに備え、フェーズ1に入れた）
- 発表会・衣装管理（採寸履歴のテーブルのみ用意）
- 通知の一斉配信
- 分析・KPI
- Super Admin 画面（プランは DB に直接入れる）
- 独自ドメインからのメール送信

---

## 10. 将来拡張として構造だけ用意するもの

実装はしないが、後から足したときにスキーマを壊さないよう、以下は認識しておく。

- **発表会**: Routine（演目）— 出演者 — 衣装 — 採寸値 — 発注 — チケット。`events` に「チケット種別を複数持てる」余地を残す
- **抽選申込**: スポット・イベントの申込方式に `first_come / lottery` の区別
- **校舎横断受講**: 同一テナント内であれば生徒が複数 Location のクラスを受講できる（別テナント間は不可）
- **会計連携**: freee / マネーフォワード への仕訳エクスポート
- **物販・在庫**
- **進級・スキル評価**
- **独自ドメイン送信**: 月額オプション（1,000〜2,000 円 / 月）。Resend のドメイン登録＋SPF/DKIM 検証

---

## 10.5 MarcheBase から流用する資産

以下は既存プロダクト MarcheBase（sekircojp/marchebase）で稼働実績があり、不具合も一通り解消済みである。ゼロから実装せず、**既存実装を参照して移植する**こと。

| 資産 | 内容 |
| --- | --- |
| 認証 | メール確認コードによるログイン（パスワード不要） |
| メール送信 | Edge Function + Resend、配信結果の追跡 |
| 定期実行 | pg_cron + pg_net（リマインド、期限通知） |
| RLS の設計パターン | 29テーブル規模での権限制御 |
| Storage | ロゴ・画像のアップロードと配信 |

### 参照時の注意

Claude Code に MarcheBase のコードを参照させる場合、**MarcheBase 側のファイルを書き換えてしまう事故**を防ぐこと。

- 参照前に MarcheBase の変更をすべてコミットしておく、または
- コピーを別フォルダに置いて参照させる

MarcheBase と Studio Flow は**別サービスであり、Supabase プロジェクト（データベース）は必ず分ける**。同一 DB に同居させない。

---

## 10.6 帳票（2026-09-06 追加）

請求書と領収書を印刷用ページとして出す。`/print/invoices/[id]`、
`?doc=receipt` で領収書になる。

PDF はサーバーで生成せず、ブラウザの印刷機能に任せる。日本語フォントの
埋め込みが不要で、そのまま紙にも出せる。保護者へメールで添付する段になったら
サーバー生成に差し替える。

適格請求書の記載要件に合わせる。ただし `invoice_registration_number` が
未入力なら、登録番号の行そのものを出さない。免税事業者が「登録番号: —」と
書かれた書類を出すと、登録していると誤解されるため（4.1）。

金額は保存された値をそのまま印字し、帳票側で計算し直さない。税率が変わっても
過去の帳票が変わらないようにするため（2.2）。

領収書は入金前でも発行できる。「明日月謝を持っていく」と言われたときに
その場で刷って渡せないと、後日渡しになる。現金回収の現場では、先に書いて
おいて受け取った日に渡すのが普通。領収日は画面で選べ、既定は当日。
入金が未登録のときは、画面にだけその旨を出す（紙には出さない）。

---

## 11. メール

### 請求のお知らせ（2026-09-06 追加）

請求を作った直後に、請求先の保護者へ金額と支払期限をメールで送る。

```
pg_cron → app.run_monthly_invoice_generation()
        → 請求を作る
        → pg_net で Edge Function（send-invoice-notice）を呼ぶ
        → Resend で送信
        → deliveries に1通ずつ結果を残す
```

画面からも「お知らせを送る」で任意のタイミングで送れる。

- **送信結果を必ず残す。** メールは「送ったのに届いていない」が一番困る。
  成否と理由を残さないと、運営が保護者に何と答えればよいか分からなくなる
- **同じ請求へ二度送らない。** `deliveries` に `(invoice_id, channel)` の
  部分一意索引（`status = 'sent'` のみ）。失敗したものは送り直せる
- **保護者が未登録・メール未入力の生徒は `skipped` として1行残す。**
  黙って飛ばすと「あの家だけ届いていない」の原因が追えない
- **鍵と URL は Vault に置く。** マイグレーションには書かない（git に残るため）。
  未設定でも請求の生成は止めない。送信の呼び出しだけを飛ばす

---

- 送信ドメインは Studio Flow 側で固定
- **From の表示名にスタジオ名、Reply-To にスタジオのメールアドレス**を設定する
- これにより、保護者からは「〇〇スタジオからのメール」に見え、返信はスタジオに届く

---

## 12. ブランド表示

| 対象 | 主表示 | 補助表示 |
| --- | --- | --- |
| 管理者・講師 | スタジオロゴ、スタジオ名 | Studio Flow |
| 保護者・生徒・一般公開 | スタジオロゴ、スタジオ名 | Powered by Studio Flow |
| Super Admin | Studio Flow | スタジオロゴは主表示しない |

- ブランド情報は `organization` 単位で一元管理し、各画面にロゴ URL やカラーを直接書かない
- ロゴは PNG / JPG / WebP / SVG に対応。`object-fit: contain` で縦横比を保つ
- **ロゴは高さを揃えて置く。正方形の枠に収めない**（2026-09-06 追記）。ロゴは社名を横に並べた形が多く、正方形に収めると縦横比の分だけ小さくなり、線にしか見えなくなる
- **アップロード時にまわりの余白を切り落とす**。SNS のアイコン用に作った正方形の画像を流用されることが多く、上下の余白がそのままだと同じ問題が起きる。処理はブラウザ側で行い、結果を登録前にプレビューで見せる
- **ロゴの形で、隣にスタジオ名を並べるかを決める**
  - 横長のロゴ（縦横比 1.8 以上。社名を並べたワードマーク）→ ロゴだけ。同じ文字が2つ出たうえ、どちらも幅が足りずに切れるため
  - 正方形に近いロゴ（シンボル）→ ロゴ＋スタジオ名。マークだけではどこのスタジオか分からないため
  - ロゴ未登録 → 頭文字＋スタジオ名
  - 縦横比は画像を読み込むまで分からないので、判定がつくまで名前は出さない
- ロゴ未登録時はスタジオ名またはイニシャルを表示
- ブランドカラーはボタン・リンク・選択状態・アクセントにのみ反映。背景全体は塗り替えない
- FREE プランでもロゴ・ブランドカラーを利用可能とする

---

## 13. 完了確認

フェーズ1の完了時に、以下を確認する。

- [ ] 直接 URL / API を叩いても、他テナントのデータに到達できない
- [ ] RLS が全テーブルで有効になっている
- [ ] 保護者1人が複数の子どもを切り替えて確認できる
- [ ] 月謝契約・月次請求・入金結果が別データとして分離されている
- [ ] 現金のみの運用で月謝管理が完結する
- [ ] 請求状態の合計が請求対象契約件数と一致する
- [ ] 出欠記録済みのレッスンが、再生成で消えない
- [ ] 在籍が満席のクラスでも、実収容上限まで体験・振替を受け付けられる
- [ ] 休会中（請求あり）と（請求停止）が区別されている
- [ ] 入金済みの請求が編集できない
- [ ] 保護者カレンダーに休講が反映される
- [ ] ロゴ未登録でもレイアウトが崩れない
- [ ] 日付をまたぐ処理が JST 基準で正しく動く

---

## 付録: Claude Code への初期指示テンプレート

```
Studio Flow というダンススタジオ向けのスクール運営管理 SaaS を作ります。
添付の設計書に従って実装してください。

前提:
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 / lucide-react / recharts
- Supabase (PostgreSQL, RLS, Storage, Edge Functions, pg_cron)
- 認証は Supabase Auth のメール確認コード方式（パスワード不要）
- Vercel にデプロイ（main への push で自動）
- 日時は timestamptz で UTC 保存、表示は Asia/Tokyo 固定
- 金額は税込・整数（円）、税率を併せて保持

マルチテナントの絶対条件:
- organizations 以外の全業務テーブルに organization_id を必須列で持たせる
- 全テーブルで RLS を有効化する
- アプリ層でも必ず organization_id で絞り込む
- Super Admin は /superadmin/* に分離し、スタジオ管理 /admin/* と混在させない

まず、設計書 4章のデータモデルを Prisma スキーマとして書いてください。
実装はフェーズ1（設計書 9章）のみです。
9.1 の「やらないこと」には着手しないでください。
```
