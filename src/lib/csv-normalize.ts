/**
 * CSV の値をそろえる
 * ────────────────────────────────────────────────
 * 移行元の書き方は、フォームごと・入力者ごとにばらばらになる。実際の
 * 入会申込フォームの書き出しでは、生年月日だけで9通りの書き方があった。
 *
 *   2015年1月21日 / 2018/6/1 / 2015.8.10 / 20170513
 *   2014(H26)年12月14日 / 2017年(平成29年)9月5日 / 令和1年6月12日
 *
 * これを1件ずつ手で直させるのは現実的ではない。
 *
 * ★ 直した内容は必ず確認画面に出す。
 *   「黙って直さない」ことが大事なのであって、「直さない」ことではない。
 *   何をどう直したかが見えていれば、取り違えにも気付ける。
 *
 * ★ 曖昧なものは直さない。
 *   日本の書式は年から始まるので 2018/6/1 は 2018年6月1日で確定する。
 *   一方 6/1/2018 のような並びは解釈が割れるので、そのまま弾く。
 */

/** 全角の数字と記号を半角にする */
function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／．－　]/g, (c) =>
      ({ "／": "/", "．": ".", "－": "-", "　": " " })[c] ?? c,
    );
}

/** 元号の始まった西暦。令和1年 = 2019年 */
const ERA_START: Record<string, number> = {
  令和: 2019,
  平成: 1989,
  昭和: 1926,
  R: 2019,
  H: 1989,
  S: 1926,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 実在する日付か。2026-02-31 のような値を通さない */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * 日付を YYYY-MM-DD にする。直せなければ null
 *
 * 括弧の中は落とす。「2014(H26)年12月14日」「2017年(平成29年)9月5日」の
 * ように、西暦と和暦が併記されている書き方があるため。
 */
export function normalizeDate(raw: string): string | null {
  const text = toHalfWidth(raw)
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!text) return null;

  // 2015年1月21日 / 2018/6/1 / 2015.8.10 / 2015-8-10
  const western = text.match(
    /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/,
  );
  if (western) {
    const [y, m, d] = western.slice(1).map(Number);
    return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  // 20170513
  const packed = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) {
    const [y, m, d] = packed.slice(1).map(Number);
    return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  // 令和1年6月12日 / H26年12月14日 / 平成29年9月5日
  const era = text.match(
    /^(令和|平成|昭和|R|H|S)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日?$/,
  );
  if (era) {
    const base = ERA_START[era[1]];
    const year = era[2] === "元" ? 1 : Number(era[2]);
    const y = base + year - 1;
    const m = Number(era[3]);
    const d = Number(era[4]);
    return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  return null;
}

/**
 * 金額を数字だけにする。「4,000円」「￥4,000」を通す
 *
 * 直した結果は確認画面に出るので、取り違えたまま進むことはない。
 */
export function normalizeAmount(raw: string): string | null {
  const text = toHalfWidth(raw)
    .replace(/[,，\s円￥¥]/g, "")
    .trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? text : null;
}

/**
 * 「長嶋芙実(ながしまふみ)」を名前とふりがなに分ける
 *
 * 閉じ括弧が「」になっている行が実データにあったので、そこも受ける。
 * 分けられなければ null を返し、元の値をそのまま名前として使う。
 */
export function splitNameKana(
  raw: string,
): { name: string; kana: string } | null {
  const m = raw.match(/^(.+?)\s*[（(](.+?)[）)」]\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  const kana = m[2].trim();
  if (!name || !kana) return null;
  return { name, kana };
}

/**
 * 「高学年クラス（水曜日 18:15〜19:15）月謝：4,000円」から
 * クラス名だけを取り出す
 *
 * 括弧より前を切り出すだけ。切り出した結果が登録済みのクラス名と
 * 完全に一致したときだけ採用する。一致しなければ元の値のまま弾く。
 * ここで新しいクラスを作らないのは変えない。
 */
export function trimClassName(raw: string): string {
  return raw.replace(/\s*[（(].*$/, "").trim();
}

/** 学校名と学年が1つのセルに入っている場合、学年だけを取り出す */
export function extractGrade(raw: string): string | null {
  const text = toHalfWidth(raw).trim();
  const m = text.match(/(年少|年中|年長|[小中高]?\s*\d{1,2}\s*年(?:生)?)\s*$/);
  return m ? m[1].replace(/\s+/g, "") : null;
}
