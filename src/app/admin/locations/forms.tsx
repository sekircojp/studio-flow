"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createLocation, createRoom, type LocationState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-base outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

function Message({ state }: { state: LocationState }) {
  if (state.error)
    return (
      <p className="text-sm text-amber-700 dark:text-amber-300">{state.error}</p>
    );
  if (state.ok)
    return (
      <p className="text-sm text-green-700 dark:text-green-400">登録しました</p>
    );
  return null;
}

export function LocationForm() {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    createLocation,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="loc-name" className="block text-sm font-medium">
          校舎名
        </label>
        <input id="loc-name" name="name" required className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="loc-address" className="block text-sm font-medium">
            住所
          </label>
          <input id="loc-address" name="address" className={inputClass} />
        </div>
        <div>
          <label htmlFor="loc-tel" className="block text-sm font-medium">
            電話番号
          </label>
          <input id="loc-tel" name="tel" type="tel" className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          校舎を追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

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
      <p className="text-sm opacity-60">
        先に校舎を1件登録すると、部屋を追加できます。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="room-location" className="block text-sm font-medium">
            校舎
          </label>
          <select
            id="room-location"
            name="location_id"
            required
            className={inputClass}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room-name" className="block text-sm font-medium">
            部屋名
          </label>
          <input id="room-name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="room-capacity" className="block text-sm font-medium">
            収容人数
          </label>
          <input
            id="room-capacity"
            name="capacity"
            type="number"
            min={1}
            inputMode="numeric"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          部屋を追加
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
