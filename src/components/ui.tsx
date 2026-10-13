import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * 管理画面で繰り返し使う小さな部品
 *
 * 画面ごとに枠線や余白を書き分けると、増えるほどばらついていく。
 * ここに集めて、見た目の判断を1か所に閉じ込める。
 *
 * 2026-10-12 見直し
 * 「線で区切る」から「面の重なりで区切る」へ寄せた。枠線は薄く、影を
 * 2層にし、押せるものだけがわずかに浮く。角丸・余白・文字の大きさは
 * 段階を減らして、画面ごとの差が出ないようにしてある。
 */

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-sf-border/80 bg-sf-card shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 濃紺の帯。ダッシュボードと請求画面の「今月の月謝」に使う。
 * 見た目の定義は globals.css の sf-hero にある
 */
export function Hero({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`sf-hero p-6 sm:p-7 ${className}`}>{children}</div>;
}

/**
 * 見出し。英字ラベル（kicker）は任意。
 * 英語と日本語の二重見出しは読む量を増やすだけなので、新しい画面では付けない。
 */
export function SectionHeading({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {kicker && <p className="sf-kicker">{kicker}</p>}
        <h2 className={`text-[15px] font-bold text-sf-ink ${kicker ? "mt-1" : ""}`}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/** 数値を1つ見せるカード。アイコンの色で種類を示す */
export function StatCard({
  icon: Icon,
  tone = "neutral",
  label,
  value,
  unit,
  note,
  href,
  className = "",
}: {
  icon: LucideIcon;
  tone?: "neutral" | "accent" | "ok" | "warn";
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  /** 指標を見たあとに行きたい場所。渡すとカード全体が押せるようになる */
  href?: string;
  /** 格子の中で幅を変えたいときなど */
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-sf-ink/6 text-sf-ink",
    accent: "bg-sf-accent/12 text-sf-accent",
    ok: "bg-sf-ok/12 text-sf-ok",
    warn: "bg-sf-warn/14 text-sf-warn",
  };

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-7 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="text-[13px] font-medium text-sf-body">{label}</span>
      </div>
      <p className="sf-num mt-4 text-[26px] font-bold leading-none text-sf-ink">
        {value}
        {unit && (
          <span className="ml-1.5 text-[13px] font-medium text-sf-muted">
            {unit}
          </span>
        )}
      </p>
      {note && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-sf-muted">{note}</p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-2xl border border-sf-border/80 bg-sf-card p-5 shadow-card transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-sf-border-strong hover:shadow-card-hover focus-visible:sf-ring ${className}`}
      >
        {body}
      </Link>
    );
  }

  return <Card className={`p-5 ${className}`}>{body}</Card>;
}

/** 空の状態。まだ何も無いことと、次に何をすればよいかを同時に出す */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-sf-border-strong/80 bg-sf-bg/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-sf-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-sf-muted">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const fieldClass =
  "mt-1 w-full rounded-xl border border-sf-border-strong/90 bg-white px-3 py-2 text-[14px] text-sf-ink shadow-[inset_0_1px_2px_rgba(23,28,53,0.04)] outline-none transition duration-150 placeholder:text-sf-muted/70 hover:border-sf-muted/70 focus:border-sf-accent focus:ring-4 focus:ring-sf-accent/15";

export const labelClass = "block text-[13px] font-medium text-sf-body";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-sf-accent px-4 py-2 text-sm font-semibold text-sf-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(23,28,53,0.12),0_8px_20px_-10px_var(--sf-accent)] transition duration-150 hover:brightness-[1.06] active:translate-y-px active:brightness-95 focus-visible:sf-ring disabled:pointer-events-none disabled:opacity-40";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-sf-border-strong/90 bg-white px-3 py-1.5 text-[13px] font-medium text-sf-body shadow-[0_1px_2px_rgba(23,28,53,0.05)] transition duration-150 hover:border-sf-muted hover:text-sf-ink active:translate-y-px focus-visible:sf-ring disabled:pointer-events-none disabled:opacity-40";

/**
 * 見出し付きの表（2026-10-13）
 *
 * 一覧は、行ごとに情報を詰め込んだカードではなく、列の揃った表にする。
 * 一覧性が高く、金額や状態を縦に比べられる。狭い幅では横にスクロールする
 * （列を落として情報を隠すより、そのまま見せる）。
 *
 *   <DataTable>
 *     <thead><tr><Th>生徒</Th>…</tr></thead>
 *     <tbody><tr><Td>…</Td></tr></tbody>
 *   </DataTable>
 */
export function DataTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-sf-border ${className}`}>
      <table className="w-full border-collapse text-[13px] [&_tbody_tr:last-child>td]:border-b-0 [&_tbody_tr]:transition [&_tbody_tr:hover]:bg-sf-bg/70">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const al = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-sf-border bg-sf-bg/80 px-4 py-2.5 text-[12px] font-semibold text-sf-body ${al} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  const al = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-sf-border px-4 py-3 align-middle ${al} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * 状態の札
 *
 * 小さな文字の帯ではなく、点と太字で読める大きさにする。色だけで伝えず、
 * 必ず文字を持つ。tone は意味で選ぶ（ok 正常 / warn 注意 / danger 問題 /
 * info 進行中 / muted 終了・対象外 / neutral その他）。
 */
export type PillTone = "ok" | "warn" | "danger" | "info" | "muted" | "neutral";

const PILL_TONES: Record<PillTone, string> = {
  ok: "bg-sf-ok/12 text-sf-ok",
  warn: "bg-sf-warn/16 text-sf-warn",
  danger: "bg-sf-danger/12 text-sf-danger",
  info: "bg-sf-accent/12 text-sf-accent",
  muted: "bg-sf-ink/6 text-sf-muted",
  neutral: "bg-sf-ink/8 text-sf-body",
};

export function Pill({
  tone = "neutral",
  children,
  dot = true,
  className = "",
}: {
  tone?: PillTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold leading-none ${PILL_TONES[tone]} ${className}`}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
