import type { Metadata } from "next";
import { DoorOpen } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { setLocationActive } from "./actions";
import { LocationForm, RoomForm } from "./forms";
import { DeleteLocationButton } from "./location-actions";
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
 *
 * 閉じた校舎は別枠に移す。一覧からは消えるが、過去のデータは残る。
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
  const openList = locationList.filter((l) => l.is_active);
  const closedList = locationList.filter((l) => !l.is_active);

  const roomsOf = (id: string) => roomList.filter((r) => r.location_id === id);

  function LocationRow({ loc, closed }: { loc: Location; closed: boolean }) {
    const inRoom = roomsOf(loc.id);
    return (
      <li className="rounded-xl border border-sf-border p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold text-sf-ink">
              {loc.name}
              {closed && (
                <span className="rounded-md bg-sf-ink/8 px-1.5 py-0.5 text-[11px] font-medium text-sf-muted">
                  閉校
                </span>
              )}
            </p>
            {(loc.address || loc.tel) && (
              <p className="mt-0.5 text-[12px] text-sf-muted">
                {[loc.address, loc.tel].filter(Boolean).join(" / ")}
              </p>
            )}
          </div>

          <form
            action={async () => {
              "use server";
              await setLocationActive(loc.id, closed);
            }}
          >
            <button type="submit" className={secondaryButtonClass}>
              {closed ? "再開する" : "閉校にする"}
            </button>
          </form>

          <DeleteLocationButton
            locationId={loc.id}
            locationName={loc.name}
            roomCount={inRoom.length}
          />
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
                  <DoorOpen className="size-3.5 text-sf-muted" aria-hidden />
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
  }

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
        <SectionHeading kicker="Open" title="運営中の校舎" />
        <div className="mt-4">
          {openList.length === 0 ? (
            <EmptyState
              title="運営中の校舎がありません"
              description="下の「校舎を追加」から登録してください。1店舗のスタジオでも1件必要です。"
            />
          ) : (
            <ul className="space-y-3">
              {openList.map((loc) => (
                <LocationRow key={loc.id} loc={loc} closed={false} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {closedList.length > 0 && (
        <Card className="p-5">
          <SectionHeading
            kicker="Closed"
            title={`閉校した校舎（${closedList.length}）`}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-sf-muted">
            運営中の一覧からは外れています。過去のレッスンや出欠の記録は残っています。
          </p>
          <ul className="mt-4 space-y-3 opacity-75">
            {closedList.map((loc) => (
              <LocationRow key={loc.id} loc={loc} closed />
            ))}
          </ul>
        </Card>
      )}

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
              locations={openList.map((l) => ({ id: l.id, name: l.name }))}
            />
          </div>
        </Card>
      </div>

      <p className="text-[12px] leading-relaxed text-sf-muted">
        <strong className="font-medium text-sf-body">削除と閉校の違い</strong>
        ：登録を間違えた校舎は「削除」で完全に消せます。実際に使った校舎は、
        レッスンや出欠の記録が付いているため削除できません。その場合は「閉校にする」を
        使ってください。一覧から外れ、記録は残ります。
      </p>
    </div>
  );
}
