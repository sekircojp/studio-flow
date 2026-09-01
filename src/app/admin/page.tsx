import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ホーム" };

/**
 * スタジオ管理のホーム
 *
 * 設計書 9章の第一表示は「今月の月謝」だが、請求はまだ作っていない。
 * それまでは、登録状況と次にやることを出す。
 */
export default async function AdminHome() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS でも絞られるが、アプリ層でも必ず organization_id で絞る（設計書 3章）
  const [locations, rooms, students] = await Promise.all([
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active"),
  ]);

  const cards = [
    { label: "在籍生徒", value: students.count ?? 0, unit: "名" },
    { label: "校舎", value: locations.count ?? 0, unit: "件" },
    { label: "部屋", value: rooms.count ?? 0, unit: "室" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-bold">ホーム</h1>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <dt className="text-xs opacity-60">{c.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">
                {c.value}
                <span className="ml-1 text-sm font-normal opacity-60">
                  {c.unit}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {/* 設計書 8章: 現在のカウント対象を常時表示する */}
        <p className="mt-2 text-xs opacity-50">
          在籍生徒のカウント対象は status = 在籍 のみ（休会・退会・体験は含めない）
        </p>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">次にやること</h2>
        <p className="mt-1 text-sm opacity-70">
          校舎と部屋を登録すると、この後のクラス設定に進めます。部屋が1つだけの
          スタジオでも、校舎の下に部屋を1件作ってください。
        </p>
        <Link
          href="/admin/locations"
          className="mt-3 inline-flex items-center gap-1 text-sm underline"
        >
          校舎・部屋を登録する
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
