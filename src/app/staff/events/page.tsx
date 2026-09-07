import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa } from "@/lib/date";
import { Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "発表会・イベント" };

/**
 * 講師の発表会・イベント一覧（設計書 4.6 / 9章 項目6）
 *
 * ★ これからの回だけを出す。
 *   講師が開くのは当日の会場か、その直前。過ぎた回の名簿を見たいときは
 *   運営に聞けばよく、現場の画面に並べると当日の回を探しにくくなる。
 *
 * ★ 中止の回も出す。
 *   会場に着いてから「今日は無いのか」を確かめられるようにする。
 */
export default async function StaffEventsPage() {
  const { membership } = await requireStaff();
  const supabase = await createClient();

  const now = new Date();
  // 当日の朝から開けるよう、今日の始まり（JST）以降を対象にする
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("id, kind, title, venue, start_at, end_at, status")
    .eq("organization_id", membership.organizationId)
    .gte("start_at", from)
    .order("start_at");

  if (error) console.error("イベントの取得に失敗しました", error);
  const list = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-sf-ink">
          発表会・イベント
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sf-body">
          当日の出欠を記録します。誰が出るかの取りまとめはスタジオが行います。
        </p>
      </div>

      <Card className="p-4">
        <SectionHeading kicker="Upcoming" title={`これからの回（${list.length}）`} />
        <div className="mt-4">
          {list.length === 0 ? (
            <EmptyState
              title="予定されている回はありません"
              description="発表会やイベントが登録されると、ここに表示されます。"
            />
          ) : (
            <ul className="space-y-2">
              {list.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/staff/events/${e.id}`}
                    className="flex items-start gap-3 rounded-xl border border-sf-border p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-sf-ink">
                          {e.title}
                        </span>
                        <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-body">
                          {e.kind === "recital" ? "発表会" : "イベント"}
                        </span>
                        {e.status === "canceled" && (
                          <span className="rounded-md bg-sf-danger/12 px-1.5 py-0.5 text-[11px] font-medium text-sf-danger">
                            中止
                          </span>
                        )}
                      </p>
                      <p className="sf-num mt-1 text-[12px] text-sf-muted">
                        {formatDateJa(e.start_at)} {formatTimeJa(e.start_at)}
                        {e.end_at && `–${formatTimeJa(e.end_at)}`}
                      </p>
                      {e.venue && (
                        <p className="mt-1 flex items-center gap-1 text-[12px] text-sf-body">
                          <MapPin className="size-3.5 text-sf-muted" aria-hidden />
                          {e.venue}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      className="mt-1 size-4 shrink-0 text-sf-muted"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
