/**
 * CSV の読み取りと、生徒取り込みの検証
 * ────────────────────────────────────────────────
 * 他社からの移行で使う。設計書 4.3 / 9.1。
 *
 * ★ 取り込みは「確認 → 実行」の2段階にする。
 *   1行でも通らないものがあれば実行させない。途中まで入って残骸が残るのが
 *   一番困る（実際の投入は DB 関数が1つのトランザクションで行う）。
 *
 * ★ 書き方のゆれは直す。ただし黙っては直さない。
 *   移行元は Google フォームの書き出しなどで、生年月日だけで9通りの
 *   書き方が混ざる。1件ずつ手で直させるのは現実的ではない。
 *   直した内容は「直した箇所」として確認画面に出し、取り違えに気付ける
 *   ようにする（正規化は csv-normalize.ts）。
 *
 * ★ 曖昧なものは直さない。
 *   日本の書式は年から始まるので 2018/6/1 は 2018年6月1日で確定する。
 *   6/1/2018 のような並びは解釈が割れるので、そのまま弾く。
 */

import {
  extractGrade,
  normalizeAmount,
  normalizeDate,
  splitNameKana,
  trimClassName,
} from "@/lib/csv-normalize";

/** 1行の中身。キーは DB 関数 import_students が受け取るものと揃える */
export type ImportRow = {
  name: string;
  name_kana: string;
  birth_date: string;
  gender: string;
  grade: string;
  enrolled_on: string;
  status: string;
  household_key: string;
  guardian_name: string;
  guardian_name_kana: string;
  relationship: string;
  guardian_email: string;
  guardian_tel: string;
  address: string;
  emergency_contact: string;
  class_name: string;
  monthly_amount: string;
  payment_method: string;
  note: string;
};

/** CSV の見出しと、内部のキーの対応 */
export const CSV_COLUMNS: { header: string; key: keyof ImportRow }[] = [
  { header: "生徒名", key: "name" },
  { header: "生徒かな", key: "name_kana" },
  { header: "生年月日", key: "birth_date" },
  { header: "性別", key: "gender" },
  { header: "学年", key: "grade" },
  { header: "入会日", key: "enrolled_on" },
  { header: "状態", key: "status" },
  { header: "世帯キー", key: "household_key" },
  { header: "保護者名", key: "guardian_name" },
  { header: "保護者かな", key: "guardian_name_kana" },
  { header: "続柄", key: "relationship" },
  { header: "保護者メール", key: "guardian_email" },
  { header: "保護者電話", key: "guardian_tel" },
  { header: "住所", key: "address" },
  { header: "緊急連絡先", key: "emergency_contact" },
  { header: "クラス名", key: "class_name" },
  { header: "月謝", key: "monthly_amount" },
  { header: "支払方法", key: "payment_method" },
  { header: "備考", key: "note" },
];

/** 画面に出す状態の名前 → DB の値 */
export const STATUS_MAP: Record<string, string> = {
  体験: "trial",
  在籍: "active",
  "休会（請求あり）": "suspended_billed",
  "休会（請求停止）": "suspended_unbilled",
  退会: "withdrawn",
};

export const METHOD_MAP: Record<string, string> = {
  現金: "cash",
  銀行振込: "bank_transfer",
  カード: "card",
  その他: "other",
};

/**
 * 支払方法の書き方のゆれ
 *
 * 申込フォームの選択肢はスタジオごとに文言が違う。意味が1つに定まる
 * ものだけを受ける。
 */
const METHOD_ALIASES: Record<string, string> = {
  クレジットカード払い: "カード",
  クレジットカード: "カード",
  クレカ: "カード",
  カード払い: "カード",
  口座振替: "銀行振込",
  振込: "銀行振込",
  銀行振替: "銀行振込",
  現金払い: "現金",
};

/**
 * CSV を行の配列にする
 *
 * 引用符の中の改行とカンマを扱う。Excel が書き出すのは
 * 「"" でエスケープした二重引用符」なので、それに合わせる。
 */
export function parseCsv(text: string): string[][] {
  // BOM を落とす。Excel から出すと先頭に付く
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // ★ 空行はここで落とさない。
  //   落としてから行番号を振ると、画面に出る「3行目」が CSV の3行目と
  //   ずれる。直す行を探せなくなるので、行の位置はそのまま保つ。
  return rows;
}

export type RowIssue = { line: number; message: string };

export type PreviewResult = {
  rows: ImportRow[];
  issues: RowIssue[];
  /** こちらで直した箇所。黙って直さないために出す */
  fixes: RowIssue[];
  /** 世帯キーごとの人数。兄弟がまとまるかを画面で見せる */
  households: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 見出しを見て、行を ImportRow に変換しながら検証する
 *
 * 未知の見出しは無視する。他社の書き出しには余計な列が付いてくるので、
 * それだけで取り込めなくなると使いものにならない。
 */
export function buildPreview(
  table: string[][],
  knownClasses: string[],
): PreviewResult {
  const issues: RowIssue[] = [];
  const fixes: RowIssue[] = [];
  const rows: ImportRow[] = [];

  if (table.length === 0) {
    return {
      rows,
      issues: [{ line: 0, message: "中身がありません。" }],
      fixes,
      households: 0,
    };
  }

  const header = table[0].map((h) => h.trim());
  const index = new Map<keyof ImportRow, number>();
  for (const col of CSV_COLUMNS) {
    const at = header.indexOf(col.header);
    if (at >= 0) index.set(col.key, at);
  }

  if (!index.has("name")) {
    return {
      rows,
      issues: [{ line: 1, message: "「生徒名」の列が見つかりません。" }],
      fixes,
      households: 0,
    };
  }

  const classSet = new Set(knownClasses);
  const householdKeys = new Set<string>();
  let noKeyCount = 0;

  for (let i = 1; i < table.length; i++) {
    const line = i + 1; // 画面には CSV の行番号で出す
    const cells = table[i];

    // 空行は黙って飛ばす。CSV の末尾によく付いてくる
    if (cells.every((c) => c.trim() === "")) continue;

    // 列数が見出しより多い行は、値の中のカンマで割れている。
    // 「高学年クラス（水曜日 18:15〜19:15）月謝：4,000円」を引用符で
    // 囲まずに貼ると起きる。以降の列がすべて1つずつずれるので、
    // 中身の検証より先に知らせる
    if (cells.length > header.length) {
      issues.push({
        line,
        message: `列が ${cells.length - header.length} 個多いです。値の中にカンマが入っていませんか（"..." で囲むか、カンマを消してください）。`,
      });
      continue;
    }
    const get = (key: keyof ImportRow) => {
      const at = index.get(key);
      return at === undefined ? "" : (cells[at] ?? "").trim();
    };

    const row: ImportRow = {
      name: get("name"),
      name_kana: get("name_kana"),
      birth_date: get("birth_date"),
      gender: get("gender"),
      grade: get("grade"),
      enrolled_on: get("enrolled_on"),
      status: get("status"),
      household_key: get("household_key"),
      guardian_name: get("guardian_name"),
      guardian_name_kana: get("guardian_name_kana"),
      relationship: get("relationship"),
      guardian_email: get("guardian_email"),
      guardian_tel: get("guardian_tel"),
      address: get("address"),
      emergency_contact: get("emergency_contact"),
      class_name: get("class_name"),
      monthly_amount: get("monthly_amount"),
      payment_method: get("payment_method"),
      note: get("note"),
    };

    if (!row.name) {
      issues.push({ line, message: "生徒名が空です。" });
      continue;
    }

    // 「長嶋芙実(ながしまふみ)」のように1つの欄に両方入っている場合は分ける。
    // ふりがなの欄が既に埋まっているときは触らない
    for (const [nameKey, kanaKey, label] of [
      ["name", "name_kana", "生徒名"],
      ["guardian_name", "guardian_name_kana", "保護者名"],
    ] as const) {
      if (row[nameKey] && !row[kanaKey]) {
        const split = splitNameKana(row[nameKey]);
        if (split) {
          row[nameKey] = split.name;
          row[kanaKey] = split.kana;
          fixes.push({
            line,
            message: `${label}「${split.name}」とふりがな「${split.kana}」に分けました。`,
          });
        }
      }
    }

    for (const [key, label] of [
      ["birth_date", "生年月日"],
      ["enrolled_on", "入会日"],
    ] as const) {
      const value = row[key];
      if (!value || DATE_RE.test(value)) continue;

      const fixed = normalizeDate(value);
      if (fixed) {
        row[key] = fixed;
        fixes.push({
          line,
          message: `${label}「${value}」を ${fixed} と読みました。`,
        });
      } else {
        issues.push({
          line,
          message: `${label}「${value}」が読めません。2015-08-10 の形で入力してください。`,
        });
      }
    }

    if (row.status) {
      const mapped = STATUS_MAP[row.status];
      if (!mapped) {
        issues.push({
          line,
          message: `状態「${row.status}」は使えません（${Object.keys(STATUS_MAP).join(" / ")}）。`,
        });
      } else {
        row.status = mapped;
      }
    }

    if (row.payment_method) {
      const alias = METHOD_ALIASES[row.payment_method];
      if (alias) {
        fixes.push({
          line,
          message: `支払方法「${row.payment_method}」を「${alias}」として読みました。`,
        });
        row.payment_method = alias;
      }
      const mapped = METHOD_MAP[row.payment_method];
      if (!mapped) {
        issues.push({
          line,
          message: `支払方法「${row.payment_method}」は使えません（${Object.keys(METHOD_MAP).join(" / ")}）。`,
        });
      } else {
        row.payment_method = mapped;
      }
    }

    if (row.monthly_amount && !/^\d+$/.test(row.monthly_amount)) {
      // 「4,000円」は意味が1つに定まる。直した結果は確認画面に出す
      const fixed = normalizeAmount(row.monthly_amount);
      if (fixed) {
        fixes.push({
          line,
          message: `月謝「${row.monthly_amount}」を ${fixed} 円として読みました。`,
        });
        row.monthly_amount = fixed;
      } else {
        issues.push({
          line,
          message: `月謝「${row.monthly_amount}」が読めません。税込の数字だけで入力してください。`,
        });
      }
    }

    // 「羽根小学校　5年」から学年だけを取り出す。学校名を置く列は無い
    if (row.grade && !/^(年少|年中|年長|[小中高]?\d{1,2}年生?)$/.test(row.grade)) {
      const grade = extractGrade(row.grade);
      if (grade && grade !== row.grade) {
        fixes.push({
          line,
          message: `学年「${row.grade}」から「${grade}」を取り出しました。`,
        });
        row.grade = grade;
      }
    }

    if (row.class_name && !classSet.has(row.class_name)) {
      // 「高学年クラス（水曜日 18:15〜19:15）月謝：4,000円」のように
      // 曜日や金額が付いている場合がある。括弧より前で照合し直す。
      // 登録済みのクラス名と完全に一致したときだけ採用する
      const trimmed = trimClassName(row.class_name);
      if (trimmed && classSet.has(trimmed)) {
        fixes.push({
          line,
          message: `クラス「${row.class_name}」を「${trimmed}」として読みました。`,
        });
        row.class_name = trimmed;
      } else {
        issues.push({
          line,
          message: `クラス「${row.class_name}」が見つかりません。先にクラスを登録してください。`,
        });
      }
    }

    if (row.household_key) householdKeys.add(row.household_key);
    else noKeyCount += 1;

    rows.push(row);
  }

  return { rows, issues, fixes, households: householdKeys.size + noKeyCount };
}
