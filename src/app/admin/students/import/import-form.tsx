"use client";

import { useActionState, useState } from "react";
import { AlertCircle, FileUp, Loader2, Upload, Wand2 } from "lucide-react";
import { previewImport, runImport, type ImportState } from "./actions";
import { CSV_COLUMNS } from "@/lib/csv";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/**
 * CSV を文字列にする
 *
 * Excel から書き出すと Shift_JIS になることが多い。UTF-8 として厳密に
 * 読んでみて、壊れたら Shift_JIS で読み直す。判定を利用者に押し付けない。
 */
async function readCsv(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

export default function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    previewImport,
    {},
  );
  const [runState, runAction, running] = useActionState<ImportState, FormData>(
    runImport,
    {},
  );
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");

  const preview = runState.preview ?? state.preview;
  const canRun = preview && preview.issues.length === 0 && preview.rows.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setCsv("");
              setFileName("");
              return;
            }
            setFileName(file.name);
            setCsv(await readCsv(file));
          }}
          className="block w-full text-[13px] text-sf-body file:mr-3 file:rounded-lg file:border-0 file:bg-sf-ink/8 file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-sf-ink hover:file:bg-sf-ink/12"
        />
        {fileName && (
          <p className="mt-1 text-[11px] text-sf-muted">{fileName}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="csv" value={csv} />
          <button
            type="submit"
            disabled={pending || running || !csv}
            className={secondaryButtonClass}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <FileUp className="size-3.5" aria-hidden />
            )}
            中身を確認する
          </button>
        </form>

        <form action={runAction}>
          <input type="hidden" name="csv" value={csv} />
          <button
            type="submit"
            disabled={pending || running || !canRun}
            className={primaryButtonClass}
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            この内容で取り込む
          </button>
        </form>

        {state.error && (
          <span className="text-[13px] text-sf-danger">{state.error}</span>
        )}
        {runState.error && (
          <span className="text-[13px] text-sf-danger">{runState.error}</span>
        )}
        {runState.ok && (
          <span className="text-[13px] text-sf-ok">{runState.message}</span>
        )}
      </div>

      {preview && (
        <div className="space-y-4">
          <p className="text-[13px] text-sf-body">
            <span className="sf-num font-bold">{preview.rows.length}</span> 名 /{" "}
            <span className="sf-num font-bold">{preview.households}</span> 世帯
            {preview.issues.length > 0 && (
              <span className="ml-2 text-sf-danger">
                直すところが {preview.issues.length} 件あります
              </span>
            )}
          </p>

          {preview.fixes.length > 0 && (
            <div className="rounded-xl border border-sf-border bg-sf-bg p-4">
              <p className="text-[12px] font-medium text-sf-ink">
                こちらで直した箇所（{preview.fixes.length} 件）
              </p>
              <p className="mt-0.5 text-[11px] text-sf-muted">
                書き方のゆれを読み替えました。取り違えが無いか確認してください。
              </p>
              <ul className="mt-2 space-y-1">
                {preview.fixes.slice(0, 30).map((fix, i) => (
                  <li
                    key={`${fix.line}-${i}`}
                    className="flex gap-2 text-[12px] text-sf-body"
                  >
                    <Wand2
                      className="mt-0.5 size-3.5 shrink-0 text-sf-muted"
                      aria-hidden
                    />
                    <span>
                      <span className="sf-num font-medium">{fix.line} 行目</span>
                      ：{fix.message}
                    </span>
                  </li>
                ))}
                {preview.fixes.length > 30 && (
                  <li className="text-[12px] text-sf-muted">
                    ほか {preview.fixes.length - 30} 件
                  </li>
                )}
              </ul>
            </div>
          )}

          {preview.issues.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-sf-danger/40 bg-sf-danger/5 p-4">
              {preview.issues.slice(0, 30).map((issue, i) => (
                <li
                  key={`${issue.line}-${i}`}
                  className="flex gap-2 text-[12px] text-sf-ink"
                >
                  <AlertCircle
                    className="mt-0.5 size-3.5 shrink-0 text-sf-danger"
                    aria-hidden
                  />
                  <span>
                    <span className="sf-num font-medium">{issue.line} 行目</span>
                    ：{issue.message}
                  </span>
                </li>
              ))}
              {preview.issues.length > 30 && (
                <li className="text-[12px] text-sf-muted">
                  ほか {preview.issues.length - 30} 件
                </li>
              )}
            </ul>
          )}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-sf-border">
              <table className="w-full min-w-[900px] border-collapse text-[12px]">
                <thead className="bg-sf-bg">
                  <tr>
                    {CSV_COLUMNS.slice(0, 9).map((c) => (
                      <th
                        key={c.key}
                        className="whitespace-nowrap px-3 py-2 text-left font-medium text-sf-body"
                      >
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-t border-sf-border">
                      {CSV_COLUMNS.slice(0, 9).map((c) => (
                        <td
                          key={c.key}
                          className="whitespace-nowrap px-3 py-1.5 text-sf-ink"
                        >
                          {row[c.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 20 && (
                <p className="border-t border-sf-border px-3 py-2 text-[11px] text-sf-muted">
                  先頭 20 行だけ表示しています（全 {preview.rows.length} 行）
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
