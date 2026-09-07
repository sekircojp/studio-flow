"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw, Send, Wallet } from "lucide-react";
import {
  applyEventFees,
  publishEvent,
  rebuildRoster,
  type EventState,
} from "../actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/**
 * 保護者への案内（設計書 4.6.3）
 *
 * ★ 公開と案内メールを1つの操作にする。
 *   「公開したのにメールを送り忘れた」「メールを送ったのにマイページに
 *   出ていない」を構造的に無くす。
 *
 * ★ 一度案内したあとでも押せる。
 *   名簿にあとから足した生徒がいるとき、その人にだけ届く。すでに答えた
 *   保護者と、すでに送った宛先には飛ばない。
 */
export function PublishEvent({
  eventId,
  invitedAt,
  unanswered,
  disabled,
}: {
  eventId: string;
  invitedAt: string | null;
  unanswered: number;
  disabled: boolean;
}) {
  const [state, setState] = useState<EventState>({});
  const [pending, startTransition] = useTransition();

  const send = () => {
    setState({});
    startTransition(async () => {
      setState(await publishEvent(eventId));
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={send}
        disabled={pending || disabled || unanswered === 0}
        className={primaryButtonClass}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {invitedAt ? "未回答の方へ再送する" : "保護者に案内する"}
      </button>

      {unanswered === 0 && !pending && (
        <span className="text-[12px] text-sf-muted">
          {invitedAt
            ? "未回答の保護者はいません"
            : "名簿を作ると案内できます"}
        </span>
      )}
      {state.message && (
        <span className="flex items-center gap-1 text-[13px] text-sf-ok">
          <Check className="size-4" aria-hidden />
          {state.message}
        </span>
      )}
      {state.error && (
        <span className="text-[13px] text-sf-danger">{state.error}</span>
      )}
    </div>
  );
}

/** 案内先の設定から名簿を作り直す（全体・クラス指定のときだけ出す） */
export function RebuildRoster({ eventId }: { eventId: string }) {
  const [state, setState] = useState<EventState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          setState({});
          startTransition(async () => {
            setState(await rebuildRoster(eventId));
          });
        }}
        disabled={pending}
        className={secondaryButtonClass}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        名簿を作り直す
      </button>
      {state.message && (
        <span className="text-[12px] text-sf-ok">{state.message}</span>
      )}
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </div>
  );
}

/**
 * 参加費を対象月の請求に載せる（設計書 4.6.3）
 *
 * ★ 月次生成のなかでも自動で載る。
 *   このボタンは、請求を先に作ってしまったあとで参加の返事が届いた場合や、
 *   合算する月をあとから変えた場合に使う。
 */
export function ApplyFees({
  billingMonth,
  billable,
  billed,
}: {
  billingMonth: string;
  billable: number;
  billed: number;
}) {
  const [state, setState] = useState<EventState>({});
  const [pending, startTransition] = useTransition();

  const remaining = Math.max(billable - billed, 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          setState({});
          startTransition(async () => {
            setState(await applyEventFees(billingMonth));
          });
        }}
        disabled={pending || remaining === 0}
        className={secondaryButtonClass}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Wallet className="size-3.5" aria-hidden />
        )}
        いま請求に載せる
      </button>
      <span className="text-[12px] text-sf-muted">
        請求済み {billed} / 対象 {billable} 人
        {remaining === 0 && billable > 0 && "（すべて反映済み）"}
      </span>
      {state.message && (
        <span className="text-[12px] text-sf-ok">{state.message}</span>
      )}
      {state.error && (
        <span className="text-[12px] text-sf-danger">{state.error}</span>
      )}
    </div>
  );
}
