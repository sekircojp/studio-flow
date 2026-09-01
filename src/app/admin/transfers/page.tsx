import type { Metadata } from "next";
import { CalendarX2, Clock, Lock, Ticket } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateJa, formatTimeJa, todayInTokyo } from "@/lib/date";
import { expireCredits } from "./actions";
import {
  AbsenceForm,
  BookingForm,
  TransferSettingsForm,
  type TransferSettings,
} from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "欠席・振替" };

const DEFAULT_SETTINGS: TransferSettings = {
  absence_deadline_hours: 2,
  credit_valid_days: 60,
  monthly_limit: 2,
  scope: "same_class",
  restore_on_absence: false,
  grant_on_no_contact: false,
};

const SCOPE_LABEL: Record<string, string> = {
  same_class: "同一クラスのみ",
  same_genre: "同ジャンル",
  any_class: "全クラス",
};

const CREDIT_STATUS: Record<string, { label: string; tone: string }> = {
  available: { label: "未使用", tone: "bg-sf-ok/12 text-sf-ok" },
  used: { label: "使用済み", tone: "bg-sf-ink/8 text-sf-muted" },
  expired: { label: "期限切れ", tone: "bg-sf-warn/14 text-sf-warn" },
  revoked: { label: "取消", tone: "bg-sf-ink/8 text-sf-muted" },
};

/**
 * 欠席・振替（設計書 5.3）
 *
 * ルールエンジンは作らない。6つの設定値だけで条件を表す。
 * 判定（範囲・上限回数・実収容上限）は DB 関数が行う。アプリ側に置くと、
 * 同時に予約が入ったときに定員を超えうる。
 */
export default async function TransfersPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;
  const today = todayInTokyo();

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [
    { data: settings },
    { data: credits },
    { data: bookings },
    { data: upcoming },
    { data: students },
  ] = await Promise.all([
    supabase
      .from("transfer_settings")
      .select(
        "absence_deadline_hours, credit_valid_days, monthly_limit, scope, restore_on_absence, grant_on_no_contact",
      )
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("transfer_credits")
      .select(
        "id, status, granted_at, expires_at, student_id, source_lesson_id, students(name), lessons!transfer_credits_source_lesson_id_organization_id_fkey(date)",
      )
      .eq("organization_id", orgId)
      .order("granted_at", { ascending: false })
      .limit(50),
    supabase
      .from("transfer_bookings")
      .select(
        "id, booked_at, canceled_at, transfer_credit_id, lessons(date, start_at, classes(name))",
      )
      .eq("organization_id", orgId)
      .is("canceled_at", null)
      .order("booked_at", { ascending: false })
      .limit(50),
    supabase
      .from("lessons")
      .select("id, date, start_at, status, classes(name)")
      .eq("organization_id", orgId)
      .gte("date", today)
      .neq("status", "canceled")
      .order("date")
      .limit(60),
    supabase
      .from("students")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("status", ["active", "trial", "suspended_billed"])
      .order("created_at"),
  ]);

  type CreditRow = {
    id: string;
    status: string;
    granted_at: string;
    expires_at: string;
    student_id: string;
    students: { name: string } | null;
    lessons: { date: string } | null;
  };
  type BookingRow = {
    id: string;
    booked_at: string;
    transfer_credit_id: string;
    lessons: { date: string; start_at: string; classes: { name: string } | null } | null;
  };
  type LessonRow = {
    id: string;
    date: string;
    start_at: string;
    classes: { name: string } | null;
  };

  const s = (settings ?? DEFAULT_SETTINGS) as TransferSettings;
  const creditList = (credits ?? []) as unknown as CreditRow[];
  const bookingList = (bookings ?? []) as unknown as BookingRow[];
  const lessonList = (upcoming ?? []) as unknown as LessonRow[];
  const studentList = (students ?? []) as { id: string; name: string }[];

  const lessonOptions = lessonList.map((l) => ({
    id: l.id,
    label: `${formatDateJa(l.date)} ${formatTimeJa(l.start_at)} ${l.classes?.name ?? ""}`,
  }));

  const available = creditList.filter((c) => c.status === "available");
  const bookingOf = (creditId: string) =>
    bookingList.find((b) => b.transfer_credit_id === creditId);

  const isOwner = membership.role === "owner";

  return (
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Operations</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          欠席・振替
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          欠席の連絡を受けたら記録します。設定した期限内なら振替権が自動で発行され、
          別の回に振り替えられます。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "未使用の振替権", value: available.length, unit: "件" },
          {
            label: "予約済みの振替",
            value: bookingList.length,
            unit: "件",
          },
          {
            label: "欠席連絡の期限",
            value: s.absence_deadline_hours,
            unit: "時間前",
          },
          { label: "有効期限", value: s.credit_valid_days, unit: "日間" },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xs text-sf-muted">{c.label}</p>
            <p className="sf-num mt-1.5 text-2xl font-bold text-sf-ink">
              {c.value}
              <span className="ml-1 text-sm font-medium text-sf-muted">
                {c.unit}
              </span>
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Absence" title="欠席を記録する" />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          保護者から連絡を受けたときに使います。記録すると出欠にも「欠席」が入り、
          名簿を開けば分かるようになります。振替の範囲は現在
          <strong className="font-medium text-sf-body">
            「{SCOPE_LABEL[s.scope]}」
          </strong>
          です。
        </p>
        <div className="mt-4">
          <AbsenceForm students={studentList} lessons={lessonOptions} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            kicker="Credits"
            title={`振替権（未使用 ${available.length} / 全 ${creditList.length}）`}
          />
          <form action={expireCredits}>
            <button type="submit" className={secondaryButtonClass}>
              <Clock className="size-3.5" aria-hidden />
              期限切れを整理
            </button>
          </form>
        </div>

        <div className="mt-4">
          {creditList.length === 0 ? (
            <EmptyState
              title="振替権はまだありません"
              description="期限内の欠席連絡を記録すると、ここに振替権が並びます。"
            />
          ) : (
            <ul className="divide-y divide-sf-border rounded-xl border border-sf-border">
              {creditList.map((c) => {
                const meta = CREDIT_STATUS[c.status] ?? CREDIT_STATUS.revoked;
                const booking = bookingOf(c.id);
                return (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Ticket
                        className="size-4 shrink-0 text-sf-muted"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sf-ink">
                            {c.students?.name ?? "（生徒不明）"}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.tone}`}
                          >
                            {meta.label}
                          </span>
                        </span>
                        <span className="sf-num mt-0.5 block text-[12px] text-sf-muted">
                          {c.lessons?.date && `${formatDateJa(c.lessons.date)}の欠席・`}
                          {formatDateJa(c.expires_at)} まで有効
                        </span>
                        {booking?.lessons && (
                          <span className="sf-num mt-0.5 flex items-center gap-1 text-[12px] text-sf-ok">
                            <CalendarX2 className="size-3" aria-hidden />
                            {formatDateJa(booking.lessons.date)}{" "}
                            {formatTimeJa(booking.lessons.start_at)}{" "}
                            {booking.lessons.classes?.name} に振替済み
                          </span>
                        )}
                      </span>
                    </div>

                    {c.status === "available" && (
                      <div className="mt-3">
                        <BookingForm creditId={c.id} lessons={lessonOptions} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading kicker="Rules" title="振替ルール" />
        <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
          設計書のとおり、条件はこの6項目だけで表します。細かい条件分岐の仕組みは作りません。
        </p>
        <div className="mt-4">
          {isOwner ? (
            <TransferSettingsForm settings={s} />
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-sf-warn/10 px-3 py-2.5 text-[13px] text-sf-ink">
              <Lock className="size-4 shrink-0 text-sf-warn" aria-hidden />
              振替ルールを変更できるのはオーナーのみです。
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
