"use client";

import { useActionState, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { savePublicSlug, type SettingsState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/** URL を1行ぶん表示する。状態を持たないので、外に出しておく */
function UrlRow({
  title,
  url,
  note,
  ready,
  copied,
  onCopy,
}: {
  title: string;
  url: string;
  note: string;
  ready: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-sf-border p-3">
      <p className="text-[13px] font-medium text-sf-ink">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-sf-muted">{note}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-sf-bg px-2.5 py-1.5 text-[12px] text-sf-body">
          {url}
        </code>
        {ready && (
          <>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sf-border-strong px-2.5 py-1.5 text-[12px] text-sf-body transition hover:border-sf-muted"
            >
              {copied ? (
                <Check className="size-3.5 text-sf-ok" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "コピーしました" : "コピー"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sf-border-strong px-2.5 py-1.5 text-[12px] text-sf-body transition hover:border-sf-muted"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              開く
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 公開ページの URL（設計書 4.6.1 / 4.6.2）
 *
 * 入会申込と体験申込の入口。オーナーがチラシや SNS に載せる文字列なので、
 * 保存したら「そのまま書き写せる形」で見せる。
 *
 * ★ 入力中も URL の見本を出す。
 *   保存してから初めて完成形を見るのでは、思っていたのと違ったときに
 *   やり直しになる。
 */
export default function PublicPageForm({
  slug,
  baseUrl,
}: {
  slug: string | null;
  baseUrl: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    savePublicSlug,
    {},
  );
  const [draft, setDraft] = useState(slug ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  const shown = draft.trim().toLowerCase();
  const applyUrl = `${baseUrl}/apply/${shown || "<URL>"}`;
  const trialUrl = `${applyUrl}/trial`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // 権限が無い環境では黙って何もしない。URL は画面に出ている
    }
  };

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="max-w-md">
          <label htmlFor="slug" className={labelClass}>
            URL に使う文字列
          </label>
          <input
            id="slug"
            name="slug"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="step-one"
            spellCheck={false}
            autoCapitalize="off"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            半角の英小文字・数字・ハイフンで、3文字以上。スクール名をローマ字に
            したものが分かりやすいです。空にすると、申込ページを閉じられます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            URL を保存する
          </button>
          {state.ok && (
            <span className="flex items-center gap-1 text-[13px] text-sf-ok">
              <Check className="size-4" aria-hidden />
              保存しました
            </span>
          )}
          {state.error && (
            <span className="text-[13px] text-sf-danger">{state.error}</span>
          )}
        </div>
      </form>

      <div className="space-y-2">
        <UrlRow
          title="入会のお申し込み"
          url={applyUrl}
          note="お申し込みは承認するまで名簿に入りません。入力されたメールアドレスが、そのまま保護者のログインに使われます。"
          ready={Boolean(shown)}
          copied={copied === applyUrl}
          onCopy={() => copy(applyUrl)}
        />
        <UrlRow
          title="体験・見学のお申し込み"
          url={trialUrl}
          note="ログインなしで申し込めます。承認すると予約が確定し、保護者へメールが届きます。"
          ready={Boolean(shown)}
          copied={copied === trialUrl}
          onCopy={() => copy(trialUrl)}
        />
      </div>

      {slug && shown !== slug && (
        <p className="rounded-xl bg-sf-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-sf-ink">
          URL を変えると、これまでに案内したリンクは開かなくなります。チラシや
          SNS に載せている場合は、そちらも差し替えてください。
        </p>
      )}
    </div>
  );
}
