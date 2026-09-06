import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { CSV_COLUMNS, METHOD_MAP, STATUS_MAP } from "@/lib/csv";
import { Card, SectionHeading, secondaryButtonClass } from "@/components/ui";
import ImportForm from "./import-form";

export const metadata: Metadata = { title: "生徒の取り込み" };

/**
 * 生徒の一括取り込み（設計書 4.3）
 *
 * 他社から乗り換えるときの移行用。1行＝1生徒で受け取り、
 * 世帯は「世帯キー」の列で束ねる。
 */
export default async function ImportPage() {
  await requireAdmin();

  const sample = [
    CSV_COLUMNS.map((c) => c.header).join(","),
    "佐藤さくら,さとうさくら,2017-05-12,女,小2,2024-04-01,在籍,sato-01,佐藤ゆき,さとうゆき,母,sato@example.com,090-0000-0000,愛知県岡崎市...,祖母 090-1111-1111,KIDS HIPHOP 初級,8800,現金,",
    "佐藤りく,さとうりく,2020-08-03,男,年中,2025-04-01,在籍,sato-01,,,,,,,,,7700,現金,兄弟",
  ].join("\n");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-[12px] text-sf-muted hover:text-sf-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          生徒・保護者
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-sf-ink">
          生徒の取り込み
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          CSV から生徒をまとめて登録します。1行が1名です。まず中身を確認して、
          直すところが無くなってから取り込みます。
          <strong className="font-medium text-sf-ink">
            途中で失敗したときは1件も登録されません。
          </strong>
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading
          kicker="Template"
          title="テンプレートを使う"
          action={
            <a
              href="/admin/students/import/template/"
              download
              className={secondaryButtonClass}
            >
              <Download className="size-3.5" aria-hidden />
              テンプレートをダウンロード
            </a>
          }
        />
        <p className="mt-3 text-[13px] leading-relaxed text-sf-body">
          いま使っている名簿や申込フォームの書き出しを、このテンプレートの列に
          貼り替えてください。列の並びを合わせるのがいちばん確実です。見本の
          2行は消して構いません。Excel でそのまま開けます。
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Upload" title="CSV を選ぶ" />
        <div className="mt-4">
          <ImportForm />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Format" title="CSV の書き方" />
        <div className="mt-4 space-y-4 text-[13px] leading-relaxed text-sf-body">
          <p>
            1行目に見出しを入れてください。並び順は自由で、余分な列があっても
            無視します。<strong className="font-medium text-sf-ink">「生徒名」だけが必須</strong>
            です。文字コードは UTF-8 と Shift_JIS のどちらでも構いません
            （Excel から書き出したままで開けます）。
          </p>

          <div className="overflow-x-auto rounded-xl bg-sf-bg p-4">
            <pre className="whitespace-pre text-[11px] leading-relaxed text-sf-ink">
              {sample}
            </pre>
          </div>

          <dl className="space-y-3">
            <div>
              <dt className="font-medium text-sf-ink">世帯キー</dt>
              <dd className="text-sf-muted">
                同じ値の行が同じ世帯（家族）になります。中身は何でも構いません
                （<code className="rounded bg-sf-ink/8 px-1">sato-01</code> でも{" "}
                <code className="rounded bg-sf-ink/8 px-1">3</code> でも）。この
                CSV の中だけで一意なら十分です。兄弟の2行目以降は保護者の列を
                空にしておけば、1行目のものが使われます。空にすると、その生徒
                だけの世帯になります。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">日付</dt>
              <dd className="text-sf-muted">
                <code className="rounded bg-sf-ink/8 px-1">2024-04-01</code>{" "}
                が基本ですが、
                <code className="rounded bg-sf-ink/8 px-1">2018/6/1</code>
                <code className="ml-1 rounded bg-sf-ink/8 px-1">2015.8.10</code>
                <code className="ml-1 rounded bg-sf-ink/8 px-1">20170513</code>
                <code className="ml-1 rounded bg-sf-ink/8 px-1">令和1年6月12日</code>{" "}
                なども読み替えます。読み替えた内容は確認画面に出るので、
                取り違えが無いか見てください。
                <code className="ml-1 rounded bg-sf-ink/8 px-1">6/1/2018</code>{" "}
                のように年が後ろに来る書き方は、解釈が割れるので弾きます。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">名前とふりがな</dt>
              <dd className="text-sf-muted">
                <code className="rounded bg-sf-ink/8 px-1">
                  長嶋芙実(ながしまふみ)
                </code>{" "}
                のように1つの欄に両方入っている場合は、括弧で分けます。ふりがなの
                欄が既に埋まっていれば、そちらを優先します。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">月謝</dt>
              <dd className="text-sf-muted">
                税込の数字だけ（
                <code className="rounded bg-sf-ink/8 px-1">8800</code>）。
                <code className="ml-1 rounded bg-sf-ink/8 px-1">4,000円</code>{" "}
                のような書き方も読み替えます。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">状態</dt>
              <dd className="text-sf-muted">
                {Object.keys(STATUS_MAP).join(" / ")}
                。空欄なら「在籍」になります。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">支払方法</dt>
              <dd className="text-sf-muted">
                {Object.keys(METHOD_MAP).join(" / ")}。空欄なら「現金」です。
              </dd>
            </div>
            <div>
              <dt className="font-medium text-sf-ink">クラス名</dt>
              <dd className="text-sf-muted">
                登録済みのクラス名と完全に一致させてください。
                <strong className="font-medium text-sf-ink">
                  ここで新しいクラスは作りません。
                </strong>
                表記のゆれでクラスが増えると、あとの片付けが手作業になります。
                先にクラスを登録しておいてください。
                <code className="ml-1 rounded bg-sf-ink/8 px-1">
                  高学年クラス（水曜日 18:15〜19:15）月謝：4,000円
                </code>{" "}
                のように後ろに情報が付いている場合は、括弧より前で照合し直します
                （それでも一致しなければ弾きます）。
              </dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  );
}
