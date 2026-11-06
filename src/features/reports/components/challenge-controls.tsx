"use client";

import { Flag, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { cancelChallenge, startChallenge } from "../challenge-actions";

/** 결산 제안 "같은 사용처 N번" 옆 — [이번 달 M번까지 해 볼게요] */
export function StartChallengeButton({ merchant, count, amount, limitCount }: { merchant: string; count: number; amount: bigint; limitCount: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startChallenge({ merchant, baselineCount: count, baselineAmount: amount.toString() });
          if (r.ok) toast.success(`이번 달 ${merchant} ${r.data?.limitCount ?? limitCount}번까지 — 홈에서 진행을 보여 드려요`);
          else toast.error(r.error);
        })
      }
    >
      <Flag /> 이번 달 {limitCount}번까지 해 볼게요
    </Button>
  );
}

/** 홈 — 이번 달 챌린지 진행 칩 */
export function ChallengeChips({ items }: { items: { id: string; merchant: string; limitCount: number; count: number }[] }) {
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="이번 달 챌린지">
      {items.map((c) => {
        const over = c.count > c.limitCount;
        return (
          <li
            key={c.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-3 text-sm",
              over ? "border-warning/40 bg-warning/10" : "bg-brand-soft",
            )}
          >
            <Flag className={cn("size-3.5", over ? "text-warning" : "text-brand")} aria-hidden />
            <span>
              {c.merchant} <b className="tabular font-semibold">{c.count}</b> / {c.limitCount}번
            </span>
            <button
              type="button"
              aria-label={`${c.merchant} 챌린지 그만하기`}
              disabled={pending}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() =>
                start(async () => {
                  const r = await cancelChallenge(c.id);
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
