import type { Metadata } from "next";
import { Ruler } from "lucide-react";
import { pickStudent, requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";
import { daysAgoInTokyo, formatDateJa } from "@/lib/date";
import { StudentSwitch } from "@/components/student-switch";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { SizeForm } from "./form";

export const metadata: Metadata = { title: "衣装サイズ" };

/** これを過ぎたら測り直しをお願いする日数。子どもの成長のはやさに合わせる */
const STALE_DAYS = 180;

type Measurement = {
  id: string;
  measured_at: string;
  height: number | null;
  wear_size: string | null;
  shoe_size: number | null;
  note: string | null;
};

/**
 * 衣装サイズ（設計書 4.3）
 *
 * ★ イベントには紐づけない。
 *   発表会が決まってから慌てて集めるのではなく、保護者がいつでも
 *   更新しておける場所にする。運営は必要になったときに最新値を見る。
 *
 * ★ 履歴として積む。
 *   子どもは成長するので、いつ時点の数値かが分からないと使えない。
 *   古くなったら、画面のほうから測り直しをお願いする。
 */
export default async function MySizesPage({
  searchParams,
}: PageProps<"/my/sizes">) {
  const { membership, students } = await requireMy();
  const params = await searchParams;
  const requested = typeof params.student === "string" ? params.student : undefined;
  const student = pickStudent(students, requested);

  if (!student) {
    return (
      <EmptyState
        title="表示できる生徒がいません"
        description="スタジオにお問い合わせください。"
      />
    );
  }

  const supabase = await createClient();

  // RLS でも自世帯に絞られるが、アプリ層でも絞る（設計書 3章）
  const { data } = await supabase
    .from("student_measurements")
    .select("id, measured_at, height, wear_size, shoe_size, note")
    .eq("student_id", student.id)
    .eq("organization_id", membership.organizationId)
    .order("measured_at", { ascending: false })
    .limit(12);

  const history = (data ?? []) as Measurement[];
  const latest = history[0] ?? null;

  // 採寸日は date 型なので、文字列のまま比べる（設計書 2.1）
  const stale =
    latest != null && latest.measured_at < daysAgoInTokyo(STALE_DAYS);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-sf-ink">
          衣装サイズ
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sf-body">
          発表会の衣装を用意するときに使います。分かるところだけで大丈夫です。
        </p>
      </div>

      {students.length > 1 && (
        <StudentSwitch
          students={students}
          currentId={student.id}
          basePath="/my/sizes"
        />
      )}

      {latest == null && (
        <p className="rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] leading-relaxed text-sf-ink">
          まだ登録がありません。発表会の前に慌てなくてよいよう、いまの
          サイズを入れておいてください。
        </p>
      )}

      {stale && (
        <p className="rounded-xl bg-sf-warn/10 px-4 py-3 text-[13px] leading-relaxed text-sf-ink">
          前回の登録から半年以上たっています。よろしければ測り直して
          ください。
        </p>
      )}

      <Card className="p-4">
        <SectionHeading
          kicker="Register"
          title="いまのサイズ"
          action={<Ruler className="size-4 text-sf-muted" aria-hidden />}
        />
        <div className="mt-4">
          <SizeForm
            studentId={student.id}
            latest={
              latest
                ? {
                    height: latest.height,
                    wearSize: latest.wear_size,
                    shoeSize: latest.shoe_size,
                  }
                : null
            }
          />
        </div>
      </Card>

      {history.length > 0 && (
        <Card className="p-4">
          <SectionHeading kicker="History" title={`これまで（${history.length}）`} />
          <ul className="mt-4 divide-y divide-sf-border rounded-xl border border-sf-border">
            {history.map((m) => (
              <li key={m.id} className="px-3 py-2.5">
                <p className="sf-num text-[12px] text-sf-muted">
                  {formatDateJa(m.measured_at)}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-[13px] text-sf-ink">
                  {m.height != null && <span className="sf-num">身長 {m.height} cm</span>}
                  {m.wear_size && <span>ウェア {m.wear_size}</span>}
                  {m.shoe_size != null && (
                    <span className="sf-num">靴 {m.shoe_size} cm</span>
                  )}
                </p>
                {m.note && (
                  <p className="mt-0.5 text-[12px] text-sf-muted">{m.note}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
