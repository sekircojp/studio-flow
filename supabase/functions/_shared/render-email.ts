/**
 * メール文面の組み立て（設計書 11章）
 * ────────────────────────────────────────────────
 * 件名も本文も、スタジオが管理画面から編集できる（移行 041）。
 *
 * ★ 差し込みと描画のきまりは DB の app.render_template() に置いてある。
 *   文面を編集する画面（Next.js）と、実際に送るここの両方が同じ結果を
 *   出す必要がある。両方に実装を持つと必ずずれるので、DB の関数を
 *   1つにして、どちらもそれを呼ぶ。
 *
 * ★ 文面が引けなくても、送信そのものは止めない。
 *   呼び出し側で組み立て済みの控えを渡せるようにしてある。文面の設定が
 *   壊れているときに、請求のお知らせが1通も出ないほうが困る。
 */

export type Rendered = { subject: string; body: string };

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export async function renderEmail(
  supabase: RpcClient,
  organizationId: string,
  kind: string,
  vars: Record<string, string>,
): Promise<Rendered | null> {
  const { data, error } = await supabase.rpc("render_email", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_vars: vars,
  });

  if (error) {
    console.error("メール文面の組み立てに失敗しました", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as Rendered | undefined;
  if (!row?.subject || !row?.body) return null;
  return row;
}

/** 本文（プレーンテキスト）を、そのままの改行で HTML にする */
export function bodyToHtml(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const safe = line
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      // 空行も高さを持たせる。詰まって読みにくくなるのを防ぐ
      return `<p style="margin:0 0 8px">${safe || "&nbsp;"}</p>`;
    })
    .join("");
}
