"use client";

import { useActionState, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { addEventEntries, type EventState } from "../actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

/**
 * 名簿に生徒を加える
 *
 * ★ クラスごとにまとめて選べるようにする。
 *   発表会は「このクラスは全員出る」という決まり方をするのが普通で、
 *   1人ずつ押させると数十回の操作になる。
 *
 * ★ すでに名簿にいる生徒は、そもそも一覧に出さない。
 *   出したうえで弾くと、押せるのに何も起きないボタンになる。
 */

export type Candidate = {
  id: string;
  name: string;
  kana: string | null;
  classIds: string[];
  classNames: string[];
};

export function AddEntries({
  eventId,
  candidates,
  classes,
}: {
  eventId: string;
  candidates: Candidate[];
  classes: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<EventState, FormData>(
    addEventEntries,
    {},
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (candidates.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        加えられる生徒がいません。在籍中の生徒は全員この名簿に入っています。
      </p>
    );
  }

  const toggle = (id: string) => {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // クラスの生徒が全員入っていれば外す、そうでなければ全員入れる
  const toggleClass = (classId: string) => {
    const ids = candidates.filter((c) => c.classIds.includes(classId)).map((c) => c.id);
    if (ids.length === 0) return;
    setPicked((p) => {
      const next = new Set(p);
      const allIn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  // 候補が1人もいないクラスは押しても何も起きないので出さない
  const usable = classes.filter((c) =>
    candidates.some((s) => s.classIds.includes(c.id)),
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />

      {usable.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-sf-body">クラスから選ぶ</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {usable.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleClass(c.id)}
                className={secondaryButtonClass}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[12px] font-medium text-sf-body">
          生徒（{picked.size} 人を選択中）
        </p>
        <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-sf-border p-2">
          {candidates.map((s) => (
            <li key={s.id}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                  picked.has(s.id) ? "bg-sf-accent/8" : "hover:bg-sf-bg"
                }`}
              >
                <input
                  type="checkbox"
                  name="student_id"
                  value={s.id}
                  checked={picked.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="size-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] text-sf-ink">{s.name}</span>
                  {s.kana && (
                    <span className="ml-2 text-[11px] text-sf-muted">{s.kana}</span>
                  )}
                  {s.classNames.length > 0 && (
                    <span className="ml-2 text-[11px] text-sf-muted">
                      {s.classNames.join("・")}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || picked.size === 0}
          className={primaryButtonClass}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="size-4" aria-hidden />
          )}
          名簿に加える
        </button>
        {state.error && (
          <p className="text-[13px] text-sf-danger">{state.error}</p>
        )}
        {state.ok && <p className="text-[13px] text-sf-ok">加えました</p>}
      </div>
    </form>
  );
}
