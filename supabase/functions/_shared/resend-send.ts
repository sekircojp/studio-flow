/**
 * メールを1通送り、結果を必ず受け取る
 * ────────────────────────────────────────────────
 * 移植元: MarcheBase supabase/functions/_shared/resend-send.ts
 *
 * resend の送信は、失敗しても例外を投げずに { data, error } の形で
 * 返してくることがある。try/catch だけで受けると、
 * 送れなかったものまで「送信できた」と記録してしまう。
 *
 * ここで «投げてくる場合» と «返してくる場合» の両方を受け止め、
 * 呼び出し側は id と error だけを見ればよい形にする。
 *
 * id は送信サービス側の識別子。
 * あとから「届いたか、戻ってきたか」を問い合わせるのに使う。
 */

export type SendResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

type ResendLike = {
  emails: {
    send: (payload: Record<string, unknown>) => Promise<unknown>;
  };
};

export async function sendMail(
  resend: ResendLike,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  try {
    const res = (await resend.emails.send(payload)) as
      | { data?: { id?: string } | null; error?: { message?: string } | null }
      | { id?: string }
      | null;

    if (res && typeof res === "object") {
      const err = (res as { error?: { message?: string } | null }).error;
      if (err) {
        return { ok: false, id: null, error: err.message ?? JSON.stringify(err) };
      }
      // 新しい版は { data: { id } }、古い版は { id } を返す
      const id =
        (res as { data?: { id?: string } | null }).data?.id ??
        (res as { id?: string }).id ??
        null;
      return { ok: true, id: id ?? null, error: null };
    }

    return { ok: true, id: null, error: null };
  } catch (e) {
    return { ok: false, id: null, error: String((e as Error)?.message ?? e) };
  }
}
