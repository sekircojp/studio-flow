# マイグレーションの適用状況

MarcheBase と同じく、適用済みかどうかをこの表で管理する。

| 順番 | ファイル | 内容 | 適用 |
|---|---|---|---|
| 1 | `20260901000100_tenant_foundation.sql` | organizations / memberships / super_admins / brand_settings / locations / rooms | 済 2026-09-01 |
| 2 | `20260901000200_tenant_foundation_rls.sql` | 上記の権限（GRANT）と RLS ポリシー | 済 2026-09-01 |
| 3 | `20260901000300_email_verification.sql` | email_verifications / find_user_id_by_email | 済 2026-09-01 |

適用先: Supabase プロジェクト `studio-flow`（ref: fterpqyvzeqcaltfkpuc / Tokyo）

## 適用のしかた

Supabase ダッシュボードの **SQL Editor** に、上から順に貼り付けて実行する。

1. ダッシュボード → 左メニューの **SQL Editor** → **New query**
2. ファイルの中身を全部コピーして貼り付け
3. **Run** を押す
4. 成功したら、この表の「適用」を「済（YYYY-MM-DD）」に書き換える

**順番を守ること。** 2 は 1 で作ったテーブルに、3 は 1 の organizations に依存している。

## ルール

- **適用済みのファイルは編集しない。** 修正が必要なら新しいファイルを追加する
- 同じファイルを2回実行しない（`create table` が既存テーブルとぶつかってエラーになる）
- ファイル名の先頭の数字は実行順。日付＋連番で付ける

## 補足

Supabase CLI の `supabase db push` でも適用できるが、CLI のログインと
DB パスワードの受け渡しが必要になる。MarcheBase と同じ SQL Editor 方式で
運用する場合は、この表が唯一の適用記録になるので、必ず更新すること。
