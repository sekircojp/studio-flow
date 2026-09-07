import type { Metadata } from "next";
import { CalendarClock, CalendarHeart, ChevronRight, MapPin, Ruler } from "lucide-react";
import Link from "next/link";
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
    answer_deadline_at: string | null;
    price: number | null;
    fee_collection: string;
    billing_month: string | null;
    fee_note: string | null;
    status: string;
    cancel_reason: string | null;
    description: string | null;
    is_public: boolean;
  } | null;
};

const ANSWER_LABEL: Record<string, string> = {
  entered: "参加します",
  undecided: "保留",
  declined: "参加しません",
  canceled: "取り消しました",
};

/** 集め方の書き方。月謝に合算するときは、何月分かまで書く */
function feeLabel(collection: string, billingMonth: string | null): string {
  if (collection === "on_site") return "当日、会場でお支払いください";
  if (collection === "bank_transfer") return "事前にお振り込みください";
  if (collection === "with_tuition") {
    return billingMonth
      ? `${Number(billingMonth.slice(5, 7))}月分の月謝と一緒にご請求します`
      : "月謝と一緒にご請求します";
  }
  return "";
}

/**
 * 保護者の発表会・イベント（設計書 4.6.3 / 9章 項目10）
 *
 * ★ ご案内した回だけが出る。
 *   名簿に入っていない回は表示しない。関係のない回に「参加しますか」と
 *   聞かれても答えようがない。きょうだいはタブで切り替える。
 *
 * ★ 回答期限を大きく出す。
 *   衣装の発注や座席の都合があるので、期限を過ぎると答えられなくなる。
 *   「いつまでに答えるのか」が分からないまま置かれるのがいちばん困る。
 *
 * ★ 過ぎた回も残す。
 *   「あの発表会はいつだったか」を後から見たいことがある。
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
      "id, status, attendance, events(id, kind, title, venue, start_at, end_at, answer_deadline_at, price, fee_collection, billing_month, fee_note, status, cancel_reason, description, is_public)",
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
    const deadline = e.answer_deadline_at ?? e.start_at;
    const closed = deadline < now;
    const canAnswer =
      answerable && !canceled && !closed && r.status !== "canceled";

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
        {e.price != null && e.price > 0 && e.fee_collection !== "none" && (
          <p className="sf-num mt-1 text-[12px] text-sf-body">
            参加費 {formatYen(e.price)}
            {feeLabel(e.fee_collection, e.billing_month) &&
              `・${feeLabel(e.fee_collection, e.billing_month)}`}
            {e.fee_note && `（${e.fee_note}）`}
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

        {canAnswer ? (
          <>
            {e.answer_deadline_at && (
              <p className="mt-3 flex items-center gap-1 rounded-lg bg-sf-warn/10 px-2.5 py-2 text-[12px] font-medium text-sf-ink">
                <CalendarClock className="size-3.5 shrink-0 text-sf-warn" aria-hidden />
                {formatDateJa(e.answer_deadline_at)}{" "}
                {formatTimeJa(e.answer_deadline_at)} までにお返事ください
              </p>
            )}
            <p className="mt-2 text-[12px] text-sf-muted">
              {r.status === "invited"
                ? "あとから変更できます。"
                : `いまのお返事: ${ANSWER_LABEL[r.status] ?? "未回答"}`}
            </p>
            <AnswerForm entryId={r.id} status={r.status} />
          </>
        ) : (
          <p className="mt-2 text-[12px] text-sf-muted">
            {ANSWER_LABEL[r.status] ?? "未回答"}
            {r.attendance === "present" && " ・ 当日ご参加"}
            {r.attendance === "absent" && " ・ 当日欠席"}
            {answerable && closed && !canceled && (
              <span className="block text-sf-danger">
                回答の期限が過ぎています。変更はスタジオへご連絡ください。
              </span>
            )}
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

      {/* 衣装サイズは下のタブに増やさず、ここから入れるようにする。
          スマートフォンでタブが6つ並ぶと、どれも押しにくくなる */}
      <Link
        href="/my/sizes"
        className="flex items-center gap-3 rounded-2xl border border-sf-border bg-sf-card p-4"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sf-accent/12 text-sf-accent">
          <Ruler className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-sf-ink">
            衣装サイズを登録する
          </span>
          <span className="block text-[12px] leading-relaxed text-sf-muted">
            発表会の衣装を用意するときに使います。先に入れておくと、直前に
            慌てずにすみます。
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-sf-muted" aria-hidden />
      </Link>

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
