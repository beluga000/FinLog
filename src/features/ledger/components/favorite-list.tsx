"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCompactKRW } from "@/lib/finance/money";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import { deleteFavorite, type FavoriteRow } from "../favorites";

/** 설정 — 즐겨찾기 목록. 즐겨찾기는 기록을 저장한 뒤 [즐겨찾기에 추가]로 만든다 */
export function FavoriteList({ favorites }: { favorites: FavoriteRow[] }) {
  const [pending, start] = useTransition();
  if (!favorites.length) {
    return <p className="text-sm text-muted-foreground">아직 없어요. 기록을 저장한 뒤 &ldquo;즐겨찾기에 추가&rdquo;를 누르면 기록 창 맨 위에 버튼이 생겨요.</p>;
  }
  return (
    <ul className="grid divide-y text-sm">
      {favorites.map((f) => (
        <li key={f.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 truncate">
            {f.name}{" "}
            <span className="text-muted-foreground tabular">
              · {TX_TYPE_META[f.type].label} {formatCompactKRW(BigInt(f.amount))}
            </span>
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${f.name} 즐겨찾기 지우기`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteFavorite(f.id);
                if (res.ok) toast.success("즐겨찾기를 지웠어요");
                else toast.error(res.error);
              })
            }
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
