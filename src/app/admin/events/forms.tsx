"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createEvent, type EventState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

/**
 * 発表会・イベントの登録（設計書 4.6.3）
 *
 * ★ 「誰に案内するか」を最初に決めさせる。
 *   毎回全員が出演するわけではない。全体・クラス指定・個別の3つから選び、
 *   全体とクラス指定なら、登録した時点で名簿ができる。
 *
 * ★ 参加費は「いくら」と「どうやって集めるか」を分けて持つ。
 *   当日徴収がもっとも多いが、月謝に合算するスタジオも、事前振込の
 *   スタジオもある。案内メールにもこの区別がそのまま載る。
 *
 * ★ 会場は自由入力。
 *   発表会は市民ホールなど、普段のスタジオ以外で開かれるのが普通。
 */

const AUDIENCES = [
  { value: "all", label: "在籍者全員", note: "退会した生徒は入りません" },
  { value: "classes", label: "クラスを指定", note: "選んだクラスの在籍者" },
  { value: "selected", label: "個別に選ぶ", note: "登録後に1人ずつ選びます" },
];

const FEE_COLLECTIONS = [
  { value: "on_site", label: "当日、会場で集める" },
  { value: "with_tuition", label: "月謝と一緒に集める（月を選ぶ）" },
  { value: "bank_transfer", label: "事前に振り込んでもらう" },
  { value: "other", label: "その他（下に書く）" },
  { value: "none", label: "徴収しない" },
];

/**
 * 合算する月の候補
 *
 * ★ 開催月から機械的に決めない。
 *   発表会は10月に案内して11月開催、集金は12月、という具合にずれる。
 *   開催月の前後を並べて、運営に選ばせる。
 *
 * 既定は開催月の翌月。開催してから請求するのがいちばん多い。
 */
function monthsAround(startAt: string) {
  const base = /^\d{4}-\d{2}/.test(startAt)
    ? new Date(`${startAt.slice(0, 7)}-01T00:00:00+09:00`)
    : new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00+09:00`);

  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();

  // 開催月の前々月から3か月後まで
  return [-2, -1, 0, 1, 2, 3].map((offset) => {
    const d = new Date(Date.UTC(y, m + offset, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    return {
      value: `${yy}-${String(mm).padStart(2, "0")}-01`,
      label:
        `${yy}年${mm}月分` +
        (offset === 0 ? "（開催月）" : offset === 1 ? "（翌月）" : ""),
    };
  });
}

export function EventForm({
  classes,
}: {
  classes: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<EventState, FormData>(
    createEvent,
    {},
  );
  const [kind, setKind] = useState("recital");
  const [audience, setAudience] = useState("all");
  const [fee, setFee] = useState("on_site");
  const [startAt, setStartAt] = useState("");

  const monthOptions = monthsAround(startAt);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-kind" className={labelClass}>
            種類
          </label>
          <select
            id="event-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={fieldClass}
          >
            <option value="recital">発表会</option>
            <option value="event">イベント（合宿・ワークショップなど）</option>
          </select>
        </div>
        <div>
          <label htmlFor="event-title" className={labelClass}>
            名前 <span className="text-sf-danger">必須</span>
          </label>
          <input
            id="event-title"
            name="title"
            required
            placeholder={kind === "recital" ? "第5回 発表会" : "夏合宿"}
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-venue" className={labelClass}>
            会場
          </label>
          <input
            id="event-venue"
            name="venue"
            placeholder="岡崎市民会館 あおいホール"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-start" className={labelClass}>
            開始日時 <span className="text-sf-danger">必須</span>
          </label>
          <input
            id="event-start"
            name="start_at"
            type="datetime-local"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-end" className={labelClass}>
            終了日時
          </label>
          <input
            id="event-end"
            name="end_at"
            type="datetime-local"
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-deadline" className={labelClass}>
            出欠の回答期限
          </label>
          <input
            id="event-deadline"
            name="answer_deadline_at"
            type="datetime-local"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            案内メールに載り、これを過ぎると保護者は答えられなくなります。
            空欄なら開催時刻までです。
          </p>
        </div>
      </div>

      <fieldset className="rounded-xl border border-sf-border p-4">
        <legend className="px-1 text-[13px] font-medium text-sf-body">
          誰に案内するか
        </legend>
        <div className="space-y-2">
          {AUDIENCES.map((a) => (
            <label
              key={a.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${
                audience === a.value ? "bg-sf-accent/8" : "hover:bg-sf-bg"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={a.value}
                checked={audience === a.value}
                onChange={() => setAudience(a.value)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-[14px] text-sf-ink">{a.label}</span>
                <span className="block text-[11px] text-sf-muted">{a.note}</span>
              </span>
            </label>
          ))}
        </div>

        {audience === "classes" && (
          <div className="mt-3 border-t border-sf-border pt-3">
            {classes.length === 0 ? (
              <p className="text-[12px] text-sf-muted">
                クラスがまだ登録されていません。
              </p>
            ) : (
              <ul className="space-y-1">
                {classes.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-sf-bg">
                      <input
                        type="checkbox"
                        name="class_id"
                        value={c.id}
                        className="size-4"
                      />
                      <span className="text-[14px] text-sf-ink">{c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-capacity" className={labelClass}>
            定員
          </label>
          <input
            id="event-capacity"
            name="capacity"
            inputMode="numeric"
            placeholder="空欄なら上限なし"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-price" className={labelClass}>
            参加費（税込・円）
          </label>
          <input
            id="event-price"
            name="price"
            inputMode="numeric"
            placeholder="空欄なら無料"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="event-fee" className={labelClass}>
            参加費の集め方
          </label>
          <select
            id="event-fee"
            name="fee_collection"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={fieldClass}
          >
            {FEE_COLLECTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
            案内メールにそのまま載ります。月謝への合算は、いまは記録だけで
            自動では請求されません。
          </p>
        </div>
        {fee === "with_tuition" && (
          <div>
            <label htmlFor="event-billing-month" className={labelClass}>
              どの月の月謝に載せるか
            </label>
            <select
              id="event-billing-month"
              name="billing_month"
              defaultValue={monthOptions[2]?.value}
              key={monthOptions[0]?.value}
              className={fieldClass}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-relaxed text-sf-muted">
              その月の請求に「参加費」の明細として入ります。載せるのは
              「参加する」と答えた生徒だけです。
            </p>
          </div>
        )}
        <div>
          <label htmlFor="event-fee-note" className={labelClass}>
            参加費の補足
          </label>
          <input
            id="event-fee-note"
            name="fee_note"
            placeholder={
              fee === "other" ? "集め方をご記入ください" : "衣装代を含みます"
            }
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-description" className={labelClass}>
            案内文
          </label>
          <textarea
            id="event-description"
            name="description"
            rows={3}
            placeholder="持ち物、集合時間、駐車場のご案内など"
            className="mt-1 w-full rounded-lg border border-sf-border-strong bg-white px-2.5 py-2 text-[14px] leading-relaxed text-sf-ink outline-none transition focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20"
          />
        </div>
      </div>

      <p className="rounded-xl bg-sf-bg px-3 py-2.5 text-[12px] leading-relaxed text-sf-body">
        登録した時点では保護者に見えません。内容が固まったら、詳細画面の
        「保護者に案内する」を押してください。そこで公開され、出欠のお願いの
        メールが届きます。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          登録する
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">登録しました</p>}
      </div>
    </form>
  );
}
