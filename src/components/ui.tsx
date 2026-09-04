import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * 管理画面で繰り返し使う小さな部品
 *
 * 画面ごとに枠線や余白を書き分けると、増えるほどばらついていく。
 * ここに集めて、見た目の判断を1か所に閉じ込める。
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
      className={`rounded-2xl border border-sf-border bg-sf-card shadow-[0_1px_2px_rgba(29,35,64,0.04),0_8px_24px_-16px_rgba(29,35,64,0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

/** 英字ラベル＋日本語見出し。モックの TODAY'S LESSONS / 本日のレッスン に相当 */
export function SectionHeading({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="sf-kicker">{kicker}</p>
        <h2 className="mt-1 text-[15px] font-bold text-sf-ink">{title}</h2>
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
}: {
  icon: LucideIcon;
  tone?: "neutral" | "accent" | "ok" | "warn";
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  /** 指標を見たあとに行きたい場所。渡すとカード全体が押せるようになる */
  href?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-sf-ink/8 text-sf-ink",
    accent: "bg-sf-accent/12 text-sf-accent",
    ok: "bg-sf-ok/12 text-sf-ok",
    warn: "bg-sf-warn/14 text-sf-warn",
  };

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`flex size-6 items-center justify-center rounded-md ${tones[tone]}`}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="text-xs font-medium text-sf-body">{label}</span>
      </div>
      <p className="sf-num mt-3 text-2xl font-bold text-sf-ink">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-sf-muted">{unit}</span>
        )}
      </p>
      {note && <p className="mt-1 text-[11px] text-sf-muted">{note}</p>}
    </>
  );

  if (href) {
    return (
      <Card className="p-4 transition hover:border-sf-accent/50">
        <Link href={href} className="block">
          {body}
        </Link>
      </Card>
    );
  }

  return <Card className="p-4">{body}</Card>;
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
    <div className="rounded-xl border border-dashed border-sf-border-strong px-6 py-10 text-center">
      <p className="text-sm font-medium text-sf-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-sf-muted">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const fieldClass =
  "mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-3 py-2 text-[15px] text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20";

export const labelClass = "block text-[13px] font-medium text-sf-body";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-sf-accent px-4 py-2 text-sm font-semibold text-sf-accent-ink transition hover:brightness-105 disabled:opacity-40";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-sf-border-strong bg-white px-3 py-1.5 text-[13px] font-medium text-sf-body transition hover:border-sf-muted";
