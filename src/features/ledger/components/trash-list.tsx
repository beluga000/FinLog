"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import { restoreTransaction } from "../actions";
import type { DeletedTxRow } from "../queries";

const DAY = 86_400_000;

/** 며칠 뒤 완전히 지워지는지 — 지운 시각 + 휴지통 기간 */
function daysLeft(deletedAt: string, trashDays: number, now: number) {
  return Math.max(0, Math.ceil((Date.parse(deletedAt) + trashDays * DAY - now) / DAY));
}

const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** 설정 > 최근 지운 기록 — 하나씩 되살린다 */
export function TrashList({ rows, trashDays, now }: { rows: DeletedTxRow[]; trashDays: number; now: number }) {
  const [pending, start] = useTransition();
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const visible = rows.filter((r) => !restored.has(r.id));
  if (!visible.length) {
    return <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">최근 {trashDays}일 동안 지운 기록이 없어요.</p>;
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {visible.map((r) => {
        const left = daysLeft(r.deletedAt, trashDays, now);
        return (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.merchant || r.categoryName || TX_TYPE_META[r.type].label}</span>
                <Money value={r.amount} className="shrink-0 text-sm font-semibold" />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {dateLabel(r.date)} · {TX_TYPE_META[r.type].label}
                {r.categoryName && r.merchant ? ` · ${r.categoryName}` : ""}
                {r.memo ? ` · ${r.memo}` : ""} · {left ? `${left}일 뒤 완전히 지워져요` : "곧 완전히 지워져요"}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await restoreTransaction(r.id);
                  if (!res.ok) return void toast.error(res.error);
                  setRestored((s) => new Set(s).add(r.id));
                  toast.success("되살렸어요 · 가계부에 다시 나와요");
                })
              }
            >
              되살리기
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
