import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, formatYen, todayInTokyo } from "@/lib/date";
import { billingMonthLabel } from "@/lib/billing";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { LessonFlagBadges } from "@/components/lesson-flags";
import { AttendanceProgressBadge } from "@/components/attendance-progress";
import { fetchDashboard, type TuitionSummary } from "@/lib/dashboard";

export const metadata: Metadata = { title: "ダッシュボード" };

/**
 * ダッシュボード
 *
 * 「今日の運営」と「処理が必要なこと」を中心にする（2026-10-13 再構成）。
 *   上段左  今日のレッスン … 時刻・クラス・部屋・講師・来場予定・出欠の進み具合
 *   上段右  要対応         … 承認待ち、出欠の入力漏れ、期限超過の未納、発表会の回答待ち
 *   下段    月謝の状況     … 対象月の請求・回収・未入金・期限超過・先月以前
 *   補助    在籍・クラスの数、日常業務への入口、初期設定（未完了のときだけ）
 *
 * 数字の作り方はすべて lib/dashboard.ts。画面側では数えない。
 * 取得に失敗した項目は「0件」に見せず、上に帯を出す。
 */
export default async function AdminHome() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;
  const today = todayInTokyo();

  const d = await fetchDashboard(supabase, orgId, today, formatYen);
  const todoTones: Record<string, string> = {
    warn: "bg-sf-warn/14 text-sf-warn",
    accent: "bg-sf-accent/12 text-sf-accent",
    neutral: "bg-sf-ink/6 text-sf-body",
  };
  const needsSetup = d.setup.needsLocation || d.setup.needsSeason || d.setup.needsClass;

  return (
    <div className="space-y-6">
      {/* 見出し。挨拶ではなく、画面名と日付と対象範囲 */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sf-ink">ダッシュボード</h1>
          <p className="mt-1 text-[13px] text-sf-body">
            {formatDateJa(today)}
            <span className="mx-2 text-sf-border-strong" aria-hidden>
              |
            </span>
            {d.counts.locations === null
              ? "対象: 取得できませんでした"
              : d.counts.locations <= 1
                ? "対象: すべてのクラス"
                : `対象: ${d.counts.locations} スタジオすべて`}
          </p>
        </div>
        <form action="/admin/students" method="get" className="flex items-center gap-2">
          <label htmlFor="dash-q" className="sr-only">
            生徒を探す
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sf-muted"
              aria-hidden
            />
            <input
              id="dash-q"
              name="q"
              type="search"
              placeholder="生徒の名前・ふりがなで探す"
              className="w-64 rounded-xl border border-sf-border-strong/90 bg-white py-2 pl-9 pr-3 text-[14px] text-sf-ink shadow-[inset_0_1px_2px_rgba(23,28,53,0.04)] outline-none transition placeholder:text-sf-muted/70 focus:border-sf-accent focus:ring-4 focus:ring-sf-accent/15"
            />
          </div>
        </form>
      </div>

      {d.failed.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-sf-warn/40 bg-sf-warn/10 px-4 py-3 text-[13px] text-sf-ink"
        >
          <AlertTriangle className="size-4 shrink-0 text-sf-warn" aria-hidden />
          <span className="min-w-0 flex-1">
            一部の情報を取得できませんでした（{d.failed.join("・")}）。
            該当する数字は「—」で出しています。
          </span>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-lg border border-sf-warn/60 bg-white px-2.5 py-1 text-[12px] font-medium text-sf-warn transition hover:bg-sf-warn/10"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            もう一度読み込む
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* 上段左: 今日のレッスン */}
        <Card className="p-5">
          <SectionHeading
            title="今日のレッスン"
            action={
              <Link href="/admin/calendar" className="text-[12px] text-sf-muted underline">
                カレンダー
              </Link>
            }
          />
          <div className="mt-4">
            {d.lessons.length === 0 ? (
              <EmptyState
                title={d.hasAnyLesson ? "今日のレッスンはありません" : "レッスンはまだありません"}
                description={
                  d.hasAnyLesson
                    ? "今日は開催予定のクラスがない日です。"
                    : "期とクラスを登録すると開催日が自動で作られ、ここに今日の予定が並びます。"
                }
              />
            ) : (
              <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
                {d.lessons.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/admin/attendance/${l.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-sf-bg sm:flex-nowrap"
                    >
                      <span className="sf-num w-14 shrink-0">
                        <span className="block text-[14px] font-semibold text-sf-ink">
                          {formatTimeJa(l.start_at)}
                        </span>
                        <span className="block text-[12px] text-sf-muted">
                          –{formatTimeJa(l.end_at)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-sf-ink sm:truncate">
                          {l.className}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-sf-muted">
                          {l.roomName && <span>{l.roomName}</span>}
                          {l.instructorName && <span>{l.instructorName}</span>}
                          {l.status !== "canceled" && (
                            <span className="sf-num text-sf-body">
                              来場予定 {l.expected} 名
                              {l.trials > 0 && `（体験 ${l.trials}）`}
                            </span>
                          )}
                        </span>
                      </span>
                      {/* 狭い幅では札を次の行に送り、クラス名が切れないようにする */}
                      <span className="flex w-full items-center gap-2 pl-[4.25rem] sm:w-auto sm:pl-0">
                        <LessonFlagBadges flags={l.flags} />
                        {l.status === "canceled" ? (
                          <span className="shrink-0 rounded-md bg-sf-danger/10 px-2 py-1 text-[12px] font-medium text-sf-danger">
                            休講
                          </span>
                        ) : (
                          <AttendanceProgressBadge progress={l.progress} ended={l.ended} />
                        )}
                        <ChevronRight className="ml-auto size-4 shrink-0 text-sf-muted sm:ml-0" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(d.weekChanges.canceled + d.weekChanges.absences + d.weekChanges.transfersIn > 0) && (
            <p className="mt-3 text-[12px] text-sf-muted">
              今週の予定の変更:
              {d.weekChanges.canceled > 0 && ` 休講 ${d.weekChanges.canceled} 回`}
              {d.weekChanges.absences > 0 && ` 欠席連絡 ${d.weekChanges.absences} 件`}
              {d.weekChanges.transfersIn > 0 && ` 振替 ${d.weekChanges.transfersIn} 名`}
              <Link href="/admin/calendar" className="ml-2 underline">
                カレンダーで見る
              </Link>
            </p>
          )}
        </Card>

        {/* 上段右: 要対応 */}
        <Card className="p-5">
          <SectionHeading
            title="要対応"
            action={
              d.todos.length > 0 ? (
                <span className="sf-num text-[12px] text-sf-muted">{d.todos.length} 項目</span>
              ) : undefined
            }
          />
          {d.todos.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-sf-ok/8 px-4 py-3 text-[13px] text-sf-ink">
              <CheckCircle2 className="size-4 shrink-0 text-sf-ok" aria-hidden />
              いま対応が必要なものはありません。
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {d.todos.map((t) => (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 rounded-xl border border-sf-border px-3 py-2.5 transition hover:border-sf-border-strong hover:bg-sf-bg"
                  >
                    <span
                      className={`sf-num shrink-0 rounded-lg px-2 py-1 text-[13px] font-bold ${todoTones[t.tone]}`}
                    >
                      {t.figure}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug text-sf-ink">
                        {t.title}
                      </span>
                      <span className="block text-[12px] leading-snug text-sf-muted">
                        {t.detail}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 下段: 月謝の状況 */}
      <TuitionCard t={d.tuition} failed={d.failed} />

      {/* 補助情報と日常業務の入口 */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card className="p-5">
          <SectionHeading title="いまの規模" />
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <Figure label="在籍生徒" value={d.counts.students} unit="名" href="/admin/students?status=active" />
            <Figure label="クラス" value={d.counts.classes} unit="クラス" href="/admin/classes" />
          </dl>
          <p className="mt-3 text-[12px] text-sf-muted">
            在籍は休会・退会・体験を含みません。
          </p>
        </Card>

        <Card className="p-5">
          <SectionHeading title="よく使う操作" />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { href: "/admin/billing", icon: Wallet, label: "入金を登録", hint: "今月の請求一覧から" },
              { href: "/admin/attendance", icon: ClipboardCheck, label: "出欠を付ける", hint: "今日の名簿を開く" },
              { href: "/admin/students/applications", icon: Inbox, label: "申込を確認", hint: "入会・体験の承認" },
              { href: "/admin/students", icon: Search, label: "生徒を探す", hint: "名前・状態で絞り込む" },
            ].map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl border border-sf-border px-3 py-2.5 transition hover:border-sf-border-strong hover:bg-sf-bg"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sf-accent/10 text-sf-accent">
                    <a.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-sf-ink">{a.label}</span>
                    <span className="block text-[12px] text-sf-muted">{a.hint}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {needsSetup && (
        <Card className="border-sf-accent/30 p-5">
          <SectionHeading title="はじめに登録するもの" />
          <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
            レッスンの予定を作るために、先に次の登録が必要です。済んだ項目は表示されなくなります。
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {d.setup.needsLocation && (
              <li>
                <Link href="/admin/locations" className="underline">スタジオ・ルームを登録する</Link>
              </li>
            )}
            {d.setup.needsSeason && (
              <li>
                <Link href="/admin/seasons" className="underline">期と休講日を登録する</Link>
              </li>
            )}
            {d.setup.needsClass && (
              <li>
                <Link href="/admin/classes" className="underline">クラスを登録してレッスンを作る</Link>
              </li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  unit,
  href,
}: {
  label: string;
  value: number | null;
  unit: string;
  href: string;
}) {
  return (
    <div>
      <dt className="text-[12px] text-sf-body">{label}</dt>
      <dd className="sf-num mt-1 text-[22px] font-bold leading-none text-sf-ink">
        <Link href={href} className="hover:underline">
          {value === null ? "—" : value}
          <span className="ml-1 text-[12px] font-medium text-sf-muted">{unit}</span>
        </Link>
      </dd>
    </div>
  );
}

/**
 * 月謝の状況
 *
 * 「今月分の請求に対する回収額」であって、「今月に入金された額」ではない。
 * 期限前の未入金は注意色にしない。期限を過ぎたぶんと、先月以前のぶんだけを
 * 注意色にする。
 */
function TuitionCard({ t, failed }: { t: TuitionSummary; failed: string[] }) {
  const unavailable = failed.includes("今月の請求") || failed.includes("入金");
  const monthLabel = billingMonthLabel(t.month);
  const q = `month=${t.month}`;

  return (
    <Card className="p-5">
      <SectionHeading
        title={`${monthLabel}の月謝`}
        action={
          <Link href={`/admin/billing?${q}`} className="text-[12px] text-sf-muted underline">
            請求一覧
          </Link>
        }
      />

      {unavailable ? (
        <p className="mt-4 text-[13px] text-sf-muted">取得できませんでした。</p>
      ) : t.state === "no_contracts" ? (
        <p className="mt-4 text-[13px] text-sf-body">
          月謝契約のある生徒がいないため、この月の請求対象はありません。
        </p>
      ) : t.state === "not_generated" ? (
        <p className="mt-4 text-[13px] text-sf-body">
          この月の請求はまだ作られていません。
          <Link href={`/admin/billing?${q}`} className="ml-2 underline">
            請求を作る
          </Link>
        </p>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Money label="請求額" value={t.billed} href={`/admin/billing?${q}`} />
          <Money label="回収済み" value={t.collected} tone="ok" href={`/admin/billing?${q}&status=paid`} />
          <Money
            label="未入金"
            value={t.unpaidAmount}
            sub={t.unpaidCount > 0 ? `${t.unpaidCount} 名` : "なし"}
            tone={t.unpaidCount > 0 ? "neutral" : "ok"}
            href={`/admin/billing?${q}&status=unpaid`}
          />
          <Money
            label="うち期限超過"
            value={t.overdueAmount}
            sub={t.overdueCount > 0 ? `${t.overdueCount} 名` : "なし"}
            tone={t.overdueCount > 0 ? "warn" : "ok"}
            href={`/admin/billing?${q}&status=unpaid&overdue=1`}
          />
          <Money
            label="先月以前の未入金"
            value={t.carriedAmount}
            sub={t.carriedCount > 0 ? `${t.carriedCount} 名` : "なし"}
            tone={t.carriedCount > 0 ? "warn" : "ok"}
            href="/admin/billing?carried=1"
          />
        </dl>
      )}

      {!unavailable && t.state === "all_paid" && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-sf-ok">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {monthLabel}分は全員から受け取っています。
        </p>
      )}
    </Card>
  );
}

function Money({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "neutral" | "ok" | "warn";
  href: string;
}) {
  const color =
    tone === "warn" ? "text-sf-warn" : tone === "ok" ? "text-sf-ok" : "text-sf-ink";
  return (
    <div>
      <dt className="text-[12px] text-sf-body">{label}</dt>
      <dd className="mt-1">
        <Link href={href} className="group block">
          <span className={`sf-num block text-[20px] font-bold leading-none group-hover:underline ${color}`}>
            {formatYen(value)}
          </span>
          {sub && <span className="mt-1 block text-[12px] text-sf-muted">{sub}</span>}
        </Link>
      </dd>
    </div>
  );
}
