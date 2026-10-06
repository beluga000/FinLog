"use client";

import { formatCompactKRW, formatKRW } from "@/lib/finance/money";

/** 차트 공통: 축·그리드는 후퇴, 텍스트는 본문 잉크, 색은 계열(entity)에만 */
export const SERIES = {
  income: "var(--chart-1)",
  expense: "var(--chart-2)",
  saving: "var(--chart-3)",
  principal: "var(--chart-1)",
  gain: "var(--chart-3)",
  netWorth: "var(--chart-1)",
  target: "var(--chart-axis)",
} as const;

export const axisProps = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--chart-grid)" },
} as const;

export const gridProps = { stroke: "var(--chart-grid)", strokeDasharray: "0", vertical: false } as const;

export const compactTick = (v: number) => (v === 0 ? "0" : formatCompactKRW(v));

export interface TooltipRow {
  label: string;
  value: number;
  color?: string;
}

/** 공통 툴팁 박스: 색 견본 + 텍스트 잉크 */
export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{title}</div>
      <div className="grid gap-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.color ? <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} /> : null}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-medium text-foreground tabular">{formatKRW(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}
