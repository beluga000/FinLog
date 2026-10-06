import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatMonthLabel, getMonthRange, shiftMonth } from "@/lib/finance/period";
import type { MonthKey } from "@/lib/finance/types";

/** 월 이동 — 다른 쿼리 파라미터(scope 등)는 유지 */
export function MonthNav({
  month,
  monthStartDay,
  basePath,
  params,
}: {
  month: MonthKey;
  monthStartDay: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: MonthKey) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    q.set("month", m);
    return `${basePath}?${q.toString()}`;
  };
  const range = getMonthRange(month, monthStartDay);
  return (
    <div className="flex items-center gap-1">
      <Link href={href(shiftMonth(month, -1))} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="이전 달">
        <ChevronLeft />
      </Link>
      <div className="min-w-28 text-center">
        <div className="text-sm font-semibold">{formatMonthLabel(month)}</div>
        {monthStartDay !== 1 ? (
          <div className="text-[11px] text-muted-foreground tabular">
            {range.start.slice(5).replace("-", ".")} ~ {shiftEnd(range.end)}
          </div>
        ) : null}
      </div>
      <Link href={href(shiftMonth(month, 1))} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="다음 달">
        <ChevronRight />
      </Link>
    </div>
  );
}

function shiftEnd(endExclusive: string) {
  const d = new Date(`${endExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(5, 10).replace("-", ".");
}
