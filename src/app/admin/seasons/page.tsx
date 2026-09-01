import type { Metadata } from "next";
import { CalendarOff, Check, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa } from "@/lib/date";
import { deleteClosure, setCurrentSeason } from "./actions";
import { ClosureForm, SeasonForm } from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "期・休講日" };

type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
};
type Closure = {
  id: string;
  date: string;
  name: string;
  location_id: string | null;
};

/**
 * 期（シーズン）と休講日（設計書 4.2）
 *
 * この2つが、レッスン一括生成（設計書 5.1）の入力になる。
 *   期の期間を走査 → クラスの曜日に一致する日 → 休講日を除外 → レッスン生成
 */
export default async function SeasonsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: seasons }, { data: closures }, { data: locations }] =
    await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, start_date, end_date, is_current")
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false }),
      supabase
        .from("studio_closures")
        .select("id, date, name, location_id")
        .eq("organization_id", orgId)
        .order("date"),
      supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("created_at"),
    ]);

  const seasonList = (seasons ?? []) as Season[];
  const closureList = (closures ?? []) as Closure[];
  const locationList = (locations ?? []) as { id: string; name: string }[];
  const locationName = (id: string | null) =>
    id ? (locationList.find((l) => l.id === id)?.name ?? "（削除された校舎）") : "全校舎";

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Lessons</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          期・休講日
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          期はレッスンを作る対象期間です。定期クラスを登録すると、この期間のうち
          クラスの曜日に当たる日が自動でレッスンになり、休講日として登録した日は除かれます。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Seasons" title="期" />
        <div className="mt-4">
          {seasonList.length === 0 ? (
            <EmptyState
              title="期がまだありません"
              description="「2026年度 前期」のように、レッスンを作りたい期間を登録してください。"
            />
          ) : (
            <ul className="space-y-2">
              {seasonList.map((s) => (
                <li
                  key={s.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
                    s.is_current
                      ? "border-sf-accent/40 bg-sf-accent/5"
                      : "border-sf-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-sf-ink">
                      {s.name}
                      {s.is_current && (
                        <span className="flex items-center gap-1 rounded-md bg-sf-accent px-1.5 py-0.5 text-[11px] font-medium text-sf-accent-ink">
                          <Check className="size-3" aria-hidden />
                          今の期
                        </span>
                      )}
                    </p>
                    <p className="sf-num mt-0.5 text-[12px] text-sf-muted">
                      {formatDateJa(s.start_date)} 〜 {formatDateJa(s.end_date)}
                    </p>
                  </div>

                  {!s.is_current && (
                    <form
                      action={async () => {
                        "use server";
                        await setCurrentSeason(s.id);
                      }}
                    >
                      <button type="submit" className={secondaryButtonClass}>
                        今の期にする
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <SeasonForm />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Closures" title="休講日" />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          年末年始やお盆など、レッスンを行わない日を登録します。
          ここに入れた日はレッスンが作られません。特定の校舎だけ休みにすることもできます。
        </p>

        <div className="mt-4">
          {closureList.length === 0 ? (
            <EmptyState
              title="休講日がまだありません"
              description="レッスンを作る前に、あらかじめ休む日を入れておくと、あとから消す手間が省けます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {closureList.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <CalendarOff
                    className="size-4 shrink-0 text-sf-muted"
                    aria-hidden
                  />
                  <span className="sf-num w-40 shrink-0 text-[13px] text-sf-ink">
                    {formatDateJa(c.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-sf-body">
                    {c.name}
                  </span>
                  <span className="text-[12px] text-sf-muted">
                    {locationName(c.location_id)}
                  </span>

                  {/* 休講日は他から参照されないため、消しても失われる履歴が無い */}
                  <form
                    action={async () => {
                      "use server";
                      await deleteClosure(c.id);
                    }}
                  >
                    <button
                      type="submit"
                      title="この休講日を削除"
                      className="flex size-7 items-center justify-center rounded-md text-sf-muted transition hover:bg-sf-danger/10 hover:text-sf-danger"
                    >
                      <X className="size-4" aria-hidden />
                      <span className="sr-only">削除</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-sf-border pt-5">
          <p className="sf-kicker">Add</p>
          <div className="mt-3">
            <ClosureForm locations={locationList} />
          </div>
        </div>
      </Card>
    </div>
  );
}
