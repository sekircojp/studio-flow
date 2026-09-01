import type { Metadata } from "next";
import { DoorOpen } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { setLocationActive } from "./actions";
import { LocationForm, RoomForm } from "./forms";
import {
  Card,
  EmptyState,
  SectionHeading,
  secondaryButtonClass,
} from "@/components/ui";

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
    <div className="space-y-6">
      <div className="pb-1">
        <p className="sf-kicker">Settings</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-sf-ink">
          校舎・部屋
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-sf-body">
          部屋が1つだけのスタジオでも、校舎の下に部屋を1件作ってください。
          あとから2部屋目が増えても、設定を作り直さずに済みます。
        </p>
      </div>

      <Card className="p-5">
        <SectionHeading kicker="Registered" title="登録済みの校舎" />

        <div className="mt-4">
          {locationList.length === 0 ? (
            <EmptyState
              title="まだ校舎が登録されていません"
              description="下の「校舎を追加」から、最初の校舎を登録してください。1店舗のスタジオでも1件必要です。"
            />
          ) : (
            <ul className="space-y-3">
              {locationList.map((loc) => {
                const inRoom = roomList.filter((r) => r.location_id === loc.id);
                return (
                  <li
                    key={loc.id}
                    className="rounded-xl border border-sf-border p-4"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-semibold text-sf-ink">
                          {loc.name}
                          {!loc.is_active && (
                            <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-muted">
                              休止中
                            </span>
                          )}
                        </p>
                        {(loc.address || loc.tel) && (
                          <p className="mt-0.5 text-[12px] text-sf-muted">
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
                        <button type="submit" className={secondaryButtonClass}>
                          {loc.is_active ? "休止する" : "再開する"}
                        </button>
                      </form>
                    </div>

                    <div className="mt-3 border-t border-sf-border pt-3">
                      <p className="sf-kicker">Rooms</p>
                      {inRoom.length === 0 ? (
                        <p className="mt-1.5 text-[13px] text-sf-warn">
                          部屋がありません。1件登録してください。
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {inRoom.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-center gap-1.5 rounded-lg bg-sf-bg px-2.5 py-1.5 text-[13px] text-sf-ink"
                            >
                              <DoorOpen
                                className="size-3.5 text-sf-muted"
                                aria-hidden
                              />
                              {r.name}
                              {r.capacity != null && (
                                <span className="sf-num text-[11px] text-sf-muted">
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
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading kicker="Add" title="校舎を追加" />
          <div className="mt-4">
            <LocationForm />
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading kicker="Add" title="部屋を追加" />
          <div className="mt-4">
            <RoomForm
              locations={activeLocations.map((l) => ({
                id: l.id,
                name: l.name,
              }))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
