"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteLocation, type LocationState } from "./actions";
import { secondaryButtonClass } from "@/components/ui";

/**
 * スタジオの削除ボタン
 *
 * 押し間違いで消えると取り返しがつかないため、必ず確認をはさむ。
 * 実績のあるスタジオはサーバー側で弾かれ、閉鎖を案内するメッセージが返る。
 */
export function DeleteLocationButton({
  locationId,
  locationName,
  roomCount,
}: {
  locationId: string;
  locationName: string;
  roomCount: number;
}) {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    deleteLocation,
    {},
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const detail =
          roomCount > 0
            ? `「${locationName}」と、その中のルーム ${roomCount} 室を削除します。`
            : `「${locationName}」を削除します。`;
        if (!confirm(`${detail}\n\nこの操作は取り消せません。よろしいですか。`)) {
          e.preventDefault();
        }
      }}
      className="contents"
    >
      <input type="hidden" name="location_id" value={locationId} />
      <button
        type="submit"
        disabled={pending}
        className={`${secondaryButtonClass} text-sf-danger hover:border-sf-danger`}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
        削除
      </button>
      {state.error && (
        <p className="mt-2 basis-full text-[12px] text-sf-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
