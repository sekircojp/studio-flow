import { requireAdmin } from "@/lib/auth/guards";
import { CSV_COLUMNS } from "@/lib/csv";

/**
 * 取り込み用の CSV テンプレート
 * ────────────────────────────────────────────────
 * 見出しの行と、書き方の見本を2行だけ入れて返す。移行元の書き出しを
 * この形に貼り替えてもらうのが、いちばん取り違えが起きにくい。
 *
 * ★ 先頭に BOM を付ける。
 *   付けないと Excel が Shift_JIS として開き、日本語の見出しが化ける。
 */
export async function GET() {
  await requireAdmin();

  const rows = [
    CSV_COLUMNS.map((c) => c.header).join(","),
    "佐藤さくら,さとうさくら,2017-05-12,女,小2,2024-04-01,在籍,sato-01,佐藤ゆき,さとうゆき,母,sato@example.com,090-0000-0000,愛知県岡崎市○○1-2-3,祖母 090-1111-1111,KIDS HIPHOP 初級,8800,現金,",
    "佐藤りく,さとうりく,2020-08-03,男,年中,2025-04-01,在籍,sato-01,,,,,,,,,7700,現金,兄弟",
  ];

  // Excel で開けるよう BOM 付きの UTF-8 にする
  const body = "\uFEFF" + rows.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="studio-flow-students-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
