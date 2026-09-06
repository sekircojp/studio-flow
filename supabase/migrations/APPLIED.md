# マイグレーションの適用状況

MarcheBase と同じく、適用済みかどうかをこの表で管理する。

| 順番 | ファイル | 内容 | 適用 |
|---|---|---|---|
| 1 | `20260901000100_tenant_foundation.sql` | organizations / memberships / super_admins / brand_settings / locations / rooms | 済 2026-09-01 |
| 2 | `20260901000200_tenant_foundation_rls.sql` | 上記の権限（GRANT）と RLS ポリシー | 済 2026-09-01 |
| 3 | `20260901000300_email_verification.sql` | email_verifications / find_user_id_by_email | 済 2026-09-01 |
| 4 | `20260901000400_students.sql` | households / guardians / students / student_measurements | 済 2026-09-01 |
| 5 | `20260901000500_students_rls.sql` | 上記の権限と RLS、自世帯判定のヘルパー | 済 2026-09-01 |
| 6 | `20260901000600_delete_location.sql` | 実績のない校舎を削除する関数 delete_location | 済 2026-09-02 |
| 7 | `20260901000700_seasons.sql` | seasons / studio_closures と、その権限・RLS | 済 2026-09-02 |
| 8 | `20260902000100_classes.sql` | instructors / classes / lessons と、その権限・RLS | 済 2026-09-02 |
| 9 | `20260902000200_generate_lessons.sql` | レッスン一括生成の関数 generate_lessons | 済 2026-09-02 |
| 10 | `20260902000300_create_student.sql` | 生徒・世帯・保護者をまとめて作る関数 create_student | 済 2026-09-02 |
| 11 | `20260902000400_attendance.sql` | enrollments / attendances と、has_attendance_record を立てるトリガ | 済 2026-09-02 |
| 12 | `20260902000500_billing.sql` | pricing_plans / student_contracts / invoices / invoice_items / payments / refunds | 済 2026-09-02 |
| 13 | `20260902000600_generate_invoices.sql` | billing_settings、請求生成 generate_invoices、入金で請求状態を同期するトリガ | 済 2026-09-02 |
| 14 | `20260902000700_transfers.sql` | transfer_settings / absence_requests / transfer_credits / transfer_bookings / waitlists | 済 2026-09-02 |
| 15 | `20260902000800_transfer_logic.sql` | submit_absence / book_transfer / expire_transfer_credits | 済 2026-09-02 |
| 16 | `20260902000900_invoice_guard.sql` | audit_logs、入金済み請求の編集禁止、請求の変更履歴 | 済 2026-09-02 |
| 17 | `20260902001000_cron.sql` | pg_cron による月次請求生成と振替権の期限切れ処理 | 済 2026-09-02 |
| 18 | `20260904000100_class_meetings.sql` | クラスと開催枠の分離（週複数回のクラスに対応） | 済 2026-09-04 |
| 19 | `20260904000200_generate_lessons_v2.sql` | レッスン生成を開催枠ごとに回すよう書き換え | 済 2026-09-04 |
| 20 | `20260904000300_create_class.sql` | クラスと開催枠を同じトランザクションで作る | 済 2026-09-04 |
| 21 | `20260904000400_generate_lessons_keep_referenced.sql` | 作り直しで欠席連絡・振替の付いた回を残す | 済 2026-09-04 |
| 22 | `20260905000100_brand_logo_storage.sql` | ロゴ画像の Storage バケットと権限 | 済 2026-09-05 |
| 23 | `20260905000200_create_location.sql` | スタジオ登録時に最初のルームを同時に作る | 済 2026-09-05 |
| 24 | `20260906000100_brand_postal_code.sql` | brand_settings に郵便番号を追加 | 済 2026-09-06 |

適用先: Supabase プロジェクト `studio-flow`（ref: fterpqyvzeqcaltfkpuc / Tokyo）

## 適用のしかた

`.env.local` の `SUPABASE_ACCESS_TOKEN` があれば、Management API から直接実行できる。

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
python scripts/apply-migration.py supabase/migrations/FILE.sql
```

`.env.local` の `SUPABASE_ACCESS_TOKEN` と `NEXT_PUBLIC_SUPABASE_URL` を読んで
Management API に投げるだけの補助スクリプト。curl で直接叩く場合は次のとおり。

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fterpqyvzeqcaltfkpuc/database/query"   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"   --data-binary @<(python -c "import json,io;print(json.dumps({'query':io.open('supabase/migrations/FILE.sql',encoding='utf-8').read()}))")
```

手作業で行う場合は、Supabase ダッシュボードの **SQL Editor** に上から順に貼り付けて実行する。

どちらの方法でも、成功したらこの表の「適用」を「済（YYYY-MM-DD）」に書き換える。

**順番を守ること。** 2 は 1 で作ったテーブルに、3 は 1 の organizations に依存している。

## ルール

- **適用済みのファイルは編集しない。** 修正が必要なら新しいファイルを追加する
- 同じファイルを2回実行しない（`create table` が既存テーブルとぶつかってエラーになる）
- ファイル名の先頭の数字は実行順。日付＋連番で付ける

## 補足

Supabase CLI の `supabase db push` でも適用できるが、CLI のログインと
DB パスワードの受け渡しが必要になる。MarcheBase と同じ SQL Editor 方式で
運用する場合は、この表が唯一の適用記録になるので、必ず更新すること。
