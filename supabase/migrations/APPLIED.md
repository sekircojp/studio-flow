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

適用先: Supabase プロジェクト `studio-flow`（ref: fterpqyvzeqcaltfkpuc / Tokyo）

## 適用のしかた

`.env.local` の `SUPABASE_ACCESS_TOKEN` があれば、Management API から直接実行できる。

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
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
