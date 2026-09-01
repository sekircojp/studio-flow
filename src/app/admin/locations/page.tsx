import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { setLocationActive } from "./actions";
import { LocationForm, RoomForm } from "./forms";

export const metadata: Metadata = { title: "校舎・部屋" };

type Room = { id: string; name: string; capacity: number | null; location_id: string };
type Location = {
  id: string;
  name: string;
  address: string | null;
  tel: string | null;
  is_active: boolean;
};

/**
 * 校舎・部屋の管理（設計書 4.1）
 *
 * 部屋が1つしかないスタジオでも、校舎の下に部屋を1件作る。
 * 後から2部屋目ができたときに構造が壊れないようにするため。
 */
export default async function LocationsPage() {
  const { membership } = await requireAdmin();
  const supabase = await createClient();
  const orgId = membership.organizationId;

  // RLS に加えて、アプリ層でも organization_id で絞る（設計書 3章）
  const [{ data: locations }, { data: rooms }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, address, tel, is_active")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("rooms")
      .select("id, name, capacity, location_id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("display_order")
      .order("created_at"),
  ]);

  const locationList = (locations ?? []) as Location[];
  const roomList = (rooms ?? []) as Room[];
  const activeLocations = locationList.filter((l) => l.is_active);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-lg font-bold">校舎・部屋</h1>
        <p className="mt-1 text-sm opacity-70">
          部屋が1つだけのスタジオでも、校舎の下に部屋を1件作ってください。
          あとから2部屋目が増えても設定を作り直さずに済みます。
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">登録済みの校舎</h2>

        {locationList.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/15 p-6 text-center text-sm opacity-60 dark:border-white/20">
            まだ校舎が登録されていません。
          </p>
        ) : (
          <ul className="space-y-3">
            {locationList.map((loc) => {
              const inRoom = roomList.filter((r) => r.location_id === loc.id);
              return (
                <li
                  key={loc.id}
                  className="rounded-lg border border-black/10 p-4 dark:border-white/15"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {loc.name}
                        {!loc.is_active && (
                          <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-normal opacity-70 dark:bg-white/15">
                            休止中
                          </span>
                        )}
                      </p>
                      {(loc.address || loc.tel) && (
                        <p className="mt-0.5 text-xs opacity-60">
                          {[loc.address, loc.tel].filter(Boolean).join(" / ")}
                        </p>
                      )}
                    </div>

                    {/* 物理削除はしない。休止／再開で表す（設計書 2章） */}
                    <form
                      action={async () => {
                        "use server";
                        await setLocationActive(loc.id, !loc.is_active);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
                      >
                        {loc.is_active ? "休止する" : "再開する"}
                      </button>
                    </form>
                  </div>

                  <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                    <p className="text-xs opacity-60">部屋</p>
                    {inRoom.length === 0 ? (
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                        部屋がありません。1件登録してください。
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {inRoom.map((r) => (
                          <li
                            key={r.id}
                            className="rounded bg-black/5 px-2 py-1 text-sm dark:bg-white/10"
                          >
                            {r.name}
                            {r.capacity != null && (
                              <span className="ml-1.5 text-xs opacity-60">
                                {r.capacity}人
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">校舎を追加</h2>
        <LocationForm />
      </section>

      <section className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">部屋を追加</h2>
        <RoomForm
          locations={activeLocations.map((l) => ({ id: l.id, name: l.name }))}
        />
      </section>
    </div>
  );
}
