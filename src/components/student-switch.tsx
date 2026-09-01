import Link from "next/link";
import type { MyStudent } from "@/lib/auth/my";

/**
 * きょうだいの切り替え（設計書 13章の確認項目）
 *
 * 「保護者1人が複数の子どもを切り替えて確認できる」を満たす。
 * リンクで切り替えるのは、状態をクライアントに持たせないため。
 * どの子を見ているかはサーバー側で決まり、見えるデータも RLS で絞られる。
 */
export function StudentSwitch({
  students,
  currentId,
  basePath,
}: {
  students: MyStudent[];
  currentId: string;
  basePath: string;
}) {
  if (students.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {students.map((s) => {
        const active = s.id === currentId;
        return (
          <Link
            key={s.id}
            href={`${basePath}?student=${s.id}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              active
                ? "bg-sf-accent text-sf-accent-ink"
                : "border border-sf-border bg-sf-card text-sf-body"
            }`}
          >
            {s.name}
          </Link>
        );
      })}
    </div>
  );
}
