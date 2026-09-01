/**
 * 差出人の組み立て
 * ────────────────────────────────────────────────
 * 移植元: MarcheBase supabase/functions/_shared/mail-from.ts
 *
 * 設計書 11章:
 *   送信ドメインは Studio Flow 側で固定し、
 *   From の表示名にスタジオ名、Reply-To にスタジオのメールアドレスを設定する。
 *   これで保護者からは「〇〇スタジオからのメール」に見え、返信はスタジオに届く。
 *
 * 表示名だけをスタジオ名に差し替える。アドレス自体は変えない。
 * 変えると SPF/DKIM の設定から外れ、迷惑メール扱いになる。
 *
 * MAIL_FROM は "addr@example.com" でも
 * "Studio Flow <addr@example.com>" でも受け取れるようにしておく。
 * 設定の書き方に依存して壊れると、原因が分かりにくい。
 */
export function mailFrom(displayName?: string | null): string {
  const raw = (Deno.env.get("MAIL_FROM") ?? "").trim();
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  const name = (displayName ?? "").trim();
  if (!name || !address) return raw;

  // 表示名に " や \ が入ると、メールの見出しが壊れる。
  // スタジオ名は自由入力なので、念のため落としておく
  const safe = [...name]
    .filter((ch) => ch !== String.fromCharCode(34) && ch !== String.fromCharCode(92))
    .join("")
    .slice(0, 60);
  return `${safe} <${address}>`;
}
