"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPLIT_METHOD_LABEL, type SplitMethodKey } from "@/lib/finance/settlement";
import { markSettled, saveSplitRule, undoSettlement } from "../settlement-actions";

const METHODS: SplitMethodKey[] = ["EQUAL", "INCOME_RATIO", "CUSTOM"];

/** 정산 나누는 방식 고르기 */
export function SplitMethodPicker({
  method,
  percentFirst,
  firstName,
  secondName,
}: {
  method: SplitMethodKey;
  percentFirst: number | null;
  firstName: string;
  secondName: string;
}) {
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(String(percentFirst ?? 50));
  const save = (m: SplitMethodKey, p: number | null) =>
    start(async () => {
      const r = await saveSplitRule({ method: m, percentFirst: p });
      if (!r.ok) toast.error(r.error);
    });
  const pct = Math.min(100, Math.max(0, Math.round(Number(custom) || 0)));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="나누는 방식">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            disabled={pending}
            onClick={() => (m === "CUSTOM" ? save(m, pct) : save(m, null))}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              method === m ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {SPLIT_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      {method === "CUSTOM" ? (
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save("CUSTOM", pct);
          }}
        >
          <span>{firstName}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="h-8 w-20"
            aria-label={`${firstName} 몫(%)`}
          />
          <span>% · {secondName} {100 - pct}%</span>
          <Button type="submit" size="sm" variant="outline" disabled={pending || pct === percentFirst}>
            저장
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** 정산 완료로 표시 / 취소 */
export function SettleButton({ month, done }: { month: string; done: boolean }) {
  const [pending, start] = useTransition();
  return done ? (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await undoSettlement(month);
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      완료 취소
    </Button>
  ) : (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await markSettled(month);
          if (!r.ok) return void toast.error(r.error);
          toast.success("정산 완료로 표시했어요");
        })
      }
    >
      보냈어요 · 정산 완료
    </Button>
  );
}
