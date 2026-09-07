import type { Metadata } from "next";
import { CalendarHeart, MapPin } from "lucide-react";
import { pickStudent, requireMy } from "@/lib/auth/my";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, formatYen } from "@/lib/date";
import { StudentSwitch } from "@/components/student-switch";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { AnswerForm } from "./form";

export const metadata: Metadata = { title: "発表会・イベント" };

type Row = {
  id: string;
  status: string;
  attendance: string;
  events: {
    id: string;
    kind: string;
    title: string;
    venue: string | null;
    start_at: string;
    end_at: string | null;
    price: number | null;
    status: string;
    cancel_reason: string | null;
    description: string | null;
    is_public: boolean;
  } | null;
};

const ANSWER_LABEL: Record<string, string> = {
  entered: "参加します",
  declined: "参加しません",
  canceled: "取り消しました",
};

/**
 * 保護者の発表会・イベント（設計書 4.6 / 9章 項目10）
 *
 * ★ 声をかけられた回だけが出る。
 *   名簿に入っていない回は表示しない。関係のない回に「参加しますか」と
 *   聞かれても答えようがない。
 *
 * ★ 過ぎた回も残す。
 *   「あの発表会はいつだったか」を後から見たいことがある。
 *   ただし回答のボタンは出さない。
 */
export default async function MyEventsPage({
  searchParams,
}: PageProps<"/my/events">) {
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
  const { data, error } = await supabase
    .from("event_entries")
    .select(
      "id, status, attendance, events(id, kind, title, venue, start_at, end_at, price, status, cancel_reason, description, is_public)",
    )
    .eq("student_id", student.id)
    .eq("organization_id", membership.organizationId);

  if (error) console.error("イベントの取得に失敗しました", error);

  const now = new Date().toISOString();
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => r.events?.is_public)
    .sort((a, b) =>
      (b.events?.start_at ?? "").localeCompare(a.events?.start_at ?? ""),
    );

  const upcoming = rows.filter(
    (r) => (r.events?.end_at ?? r.events?.start_at ?? "") >= now,
  );
  const past = rows.filter((r) => !upcoming.includes(r));

  const Item = ({ r, answerable }: { r: Row; answerable: boolean }) => {
    const e = r.events;
    if (!e) return null;
    const canceled = e.status === "canceled";

    return (
      <li className="rounded-xl border border-sf-border p-4">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-sf-ink">{e.title}</span>
          <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-body">
            {e.kind === "recital" ? "発表会" : "イベント"}
          </span>
          {canceled && (
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
        {e.price != null && e.price > 0 && (
          <p className="sf-num mt-1 text-[12px] text-sf-body">
            参加費 {formatYen(e.price)}
          </p>
        )}
        {e.description && (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-sf-body">
            {e.description}
          </p>
        )}
        {canceled && e.cancel_reason && (
          <p className="mt-2 text-[12px] text-sf-danger">{e.cancel_reason}</p>
        )}

        {answerable && !canceled ? (
          <>
            <p className="mt-3 text-[12px] text-sf-muted">
              {r.status === "invited"
                ? "参加されるかお知らせください。あとから変更できます。"
                : `いまのお返事: ${ANSWER_LABEL[r.status] ?? "未回答"}`}
            </p>
            <AnswerForm entryId={r.id} status={r.status} />
          </>
        ) : (
          <p className="mt-2 text-[12px] text-sf-muted">
            {ANSWER_LABEL[r.status] ?? "未回答"}
            {r.attendance === "present" && " ・ 当日ご参加"}
            {r.attendance === "absent" && " ・ 当日欠席"}
            {r.attendance === "late" && " ・ 当日遅刻"}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-sf-ink">
          発表会・イベント
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sf-body">
          お子さまにご案内している回です。参加されるかをお知らせください。
        </p>
      </div>

      {students.length > 1 && (
        <StudentSwitch
          students={students}
          currentId={student.id}
          basePath="/my/events"
        />
      )}

      <Card className="p-4">
        <SectionHeading
          kicker="Upcoming"
          title={`これからの回（${upcoming.length}）`}
          action={<CalendarHeart className="size-4 text-sf-muted" aria-hidden />}
        />
        <div className="mt-4">
          {upcoming.length === 0 ? (
            <EmptyState
              title="ご案内している回はありません"
              description="発表会やイベントのご案内があると、ここに表示されます。"
            />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((r) => (
                <Item key={r.id} r={r} answerable />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {past.length > 0 && (
        <Card className="p-4">
          <SectionHeading kicker="Past" title={`過去の回（${past.length}）`} />
          <ul className="mt-4 space-y-3">
            {past.map((r) => (
              <Item key={r.id} r={r} answerable={false} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
