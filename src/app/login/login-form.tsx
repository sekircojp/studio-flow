"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * ログインフォーム（メール確認コード方式・パスワード不要）
 * ────────────────────────────────────────────────
 * 設計書 2章。保護者層が主要な利用者になるため、
 * 「パスワードを忘れた」という問い合わせが構造的に発生しない方式にする。
 *
 * 流れ:
 *   1. メールアドレスを入力 → send-verification-code が6桁を送る
 *   2. 届いた6桁を入力 → verify-code が照合し、トークンを返す
 *   3. そのトークンで verifyOtp してセッションを Cookie に確立する
 *
 * 照合はすべてサーバー側。コードの正解はブラウザに一度も渡らない。
 */

/** verify-code が返す理由コードを、利用者向けの日本語にする */
const REASON_MESSAGES: Record<string, string> = {
  invalid_input: "コードは6桁の数字です。",
  no_code: "コードの有効期限が切れています。もう一度送信してください。",
  expired: "コードの有効期限が切れています。もう一度送信してください。",
  too_many_attempts:
    "入力を間違えた回数が上限に達しました。もう一度送信してください。",
  mismatch: "コードが違います。",
  server_error: "うまくいきませんでした。時間をおいて試してください。",
};

type Step = "email" | "code";

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.functions.invoke("send-verification-code", {
        body: { email: email.trim().toLowerCase() },
      });

      if (error) {
        setMessage("確認コードを送信できませんでした。時間をおいて試してください。");
        return;
      }

      // 登録済みかどうかはここでは分からない（意図的にそうしている）。
      // 未登録のアドレスにも同じ案内を出す。
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("verify-code", {
        body: { email: email.trim().toLowerCase(), code: code.trim() },
      });

      if (error || !data) {
        setMessage(REASON_MESSAGES.server_error);
        return;
      }

      if (!data.valid) {
        const base = REASON_MESSAGES[data.reason] ?? REASON_MESSAGES.server_error;
        const left =
          typeof data.attempts_left === "number" && data.attempts_left > 0
            ? `（あと${data.attempts_left}回）`
            : "";
        setMessage(base + left);
        return;
      }

      if (!data.registered) {
        // コードは届いている＝本人のメールボックス。状況をはっきり伝えてよい
        setMessage(
          "このメールアドレスは登録されていません。スタジオにお問い合わせください。",
        );
        return;
      }

      // セッションを Cookie に確立する。ここからサーバー側でもロールを判定できる
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });

      if (otpError) {
        setMessage("ログインできませんでした。もう一度お試しください。");
        return;
      }

      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold tracking-tight">Studio Flow</h1>
        <p className="mt-1 text-sm opacity-70">
          {step === "email"
            ? "メールアドレスに確認コードをお送りします。"
            : `${email} に6桁のコードを送りました。`}
        </p>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-base outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="size-4" aria-hidden />
              )}
              確認コードを送る
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium">
                確認コード（6桁）
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-center text-xl tracking-[0.4em] outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </div>

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              ログイン
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setMessage("");
              }}
              className="w-full text-sm underline opacity-70"
            >
              メールアドレスを入れ直す
            </button>
          </form>
        )}

        {message && (
          <p
            role="status"
            className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
