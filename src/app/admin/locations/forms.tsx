"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createLocation, createRoom, type LocationState } from "./actions";
import { fieldClass, labelClass, primaryButtonClass } from "@/components/ui";

function Message({ state }: { state: LocationState }) {
  if (state.error)
    return <p className="text-[13px] text-sf-danger">{state.error}</p>;
  if (state.ok)
    return <p className="text-[13px] text-sf-ok">登録しました</p>;
  return null;
}

/**
 * スタジオの登録
 *
 * ルーム名は任意。空なら「メインルーム」で1件が自動で作られる。
 * 1部屋しかないスタジオの人にとって「ルーム名」は無い概念なので、
 * 必須にすると答えようがない（設計書 4.1）。
 */
export function LocationForm() {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    createLocation,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="loc-name" className={labelClass}>
          スタジオ名
        </label>
        <input id="loc-name" name="name" required className={fieldClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="loc-address" className={labelClass}>
            住所
          </label>
          <input id="loc-address" name="address" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="loc-tel" className={labelClass}>
            電話番号
          </label>
          <input id="loc-tel" name="tel" type="tel" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="loc-room" className={labelClass}>
            ルーム名（任意）
          </label>
          <input
            id="loc-room"
            name="room_name"
            placeholder="メインルーム"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-sf-muted">
            分かれていなければ空のままで構いません
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          スタジオを追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/**
 * ルームの追加
 *
 * スタジオを作った時点で1件は入っているので、ここを使うのは
 * 部屋が実際に分かれているスタジオだけ。
 */
export function RoomForm({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    createRoom,
    {},
  );

  if (locations.length === 0) {
    return (
      <p className="text-[13px] text-sf-muted">
        先にスタジオを1件登録してください。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="room-location" className={labelClass}>
            スタジオ
          </label>
          <select
            id="room-location"
            name="location_id"
            required
            className={fieldClass}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room-name" className={labelClass}>
            ルーム名
          </label>
          <input id="room-name" name="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="room-capacity" className={labelClass}>
            収容人数
          </label>
          <input
            id="room-capacity"
            name="capacity"
            type="number"
            min={1}
            inputMode="numeric"
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          ルームを追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
