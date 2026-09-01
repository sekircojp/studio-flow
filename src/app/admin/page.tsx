import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  DoorOpen,
  Home,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, greetingJa } from "@/lib/date";
import { Card, EmptyState, SectionHeading, StatCard } from "@/components/ui";

export const metadata: Metadata = { title: "ダッシュボード" };

/**
 * ダッシュボード
 *
 * 設計書 9章の第一表示は「今月の月謝」。請求はまだ作っていないため、
 * 金額を作り話で埋めず、何が足りないかを出す。
 */
export default async function AdminHome() {
  const { membership, email } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS でも絞られるが、アプリ層でも必ず organization_id で絞る（設計書 3章）
  const count = (table: string, extra?: [string, string]) => {
    let q = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if (extra) q = q.eq(extra[0], extra[1]);
    return q;
  };

  const [students, households, locations, rooms] = await Promise.all([
    count("students", ["status", "active"]),
    count("households"),
    count("locations", ["is_active", "true"]),
    count("rooms", ["is_active", "true"]),
  ]);

  const needsLocation = (locations.count ?? 0) === 0;
  const needsRoom = (rooms.count ?? 0) === 0;
  const name = email?.split("@")[0] ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <p className="sf-kicker">{formatDateJa(new Date())}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
            {greetingJa()}
            {name && <span>、{name} さん</span>}
          </h1>
          <p className="mt-1 text-[13px] text-sf-body">
            月謝の回収状況と今日のスタジオ運営を確認しましょう
          </p>
        </div>
      </div>

      {/* 第一表示＝今月の月謝（設計書 9章）。まだ請求機能が無いので、その旨を出す */}
      <div className="overflow-hidden rounded-2xl bg-sf-nav p-6 text-sf-nav-ink">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sf-nav-muted">
          今月の月謝
        </p>
        <p className="sf-num mt-2 text-3xl font-bold">まだ請求はありません</p>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sf-nav-muted">
          料金プランと月謝契約を登録すると、ここに今月の回収状況が出ます。
          現金でも「誰から受け取ったか／受け取っていないか」が一目で分かる形にします。
        </p>
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-sf-nav-ink">
          <Wallet className="size-3.5" aria-hidden />
          月謝・請求はこれから作ります
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          tone="accent"
          label="在籍生徒"
          value={students.count ?? 0}
          unit="名"
          note="休会・退会・体験は含めません"
        />
        <StatCard
          icon={Home}
          label="世帯"
          value={households.count ?? 0}
          unit="世帯"
          note="兄弟割の判定単位"
        />
        <StatCard
          icon={Building2}
          tone={needsLocation ? "warn" : "ok"}
          label="校舎"
          value={locations.count ?? 0}
          unit="校"
          note={needsLocation ? "未登録です" : "稼働中"}
        />
        <StatCard
          icon={DoorOpen}
          tone={needsRoom ? "warn" : "ok"}
          label="部屋"
          value={rooms.count ?? 0}
          unit="室"
          note={needsRoom ? "校舎ごとに1件は必要です" : "稼働中"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <SectionHeading kicker="Today's lessons" title="本日のレッスン" />
          <div className="mt-4">
            <EmptyState
              title="レッスンはまだありません"
              description="期（シーズン）と定期クラスを登録すると、開催日が自動で作られ、ここに今日の予定が並びます。"
            />
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading kicker="Quick actions" title="クイック操作" />
          <ul className="mt-4 space-y-2">
            {[
              {
                href: "/admin/locations",
                icon: Building2,
                label: "校舎・部屋を登録",
                hint: needsLocation ? "まだ登録されていません" : undefined,
              },
              {
                href: "/admin/settings",
                icon: Settings,
                label: "スタジオ設定を編集",
                hint: undefined,
              },
            ].map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl border border-sf-border px-3 py-2.5 transition hover:border-sf-accent/50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sf-accent/10 text-sf-accent">
                    <a.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-sf-ink">
                      {a.label}
                    </span>
                    {a.hint && (
                      <span className="block text-[11px] text-sf-warn">
                        {a.hint}
                      </span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-sf-bg p-4">
            <p className="sf-kicker">Next up</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-sf-ink">
              <CalendarDays className="size-4 text-sf-muted" aria-hidden />
              期と休講日の登録
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
              定期クラスとレッスンの一括生成に必要な土台です。次はここを作ります。
            </p>
          </div>
        </Card>
      </div>

    </div>
  );
}
