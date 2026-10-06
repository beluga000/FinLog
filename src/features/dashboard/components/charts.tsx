"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, compactTick, gridProps, Legend, SERIES, TooltipBox } from "@/components/charts/chart-kit";

export interface CashflowPoint {
  month: string;
  label: string;
  income: number;
  expense: number;
  saving: number;
}

/** 최근 12개월 수입/지출/저축 — 묶음 막대 (한 축, 같은 단위) */
export function CashflowTrendChart({ data }: { data: CashflowPoint[] }) {
  return (
    <div className="grid gap-3">
      <Legend
        items={[
          { label: "수입", color: SERIES.income },
          { label: "지출", color: SERIES.expense },
          { label: "저축·투자", color: SERIES.saving },
        ]}
      />
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={48} tickFormatter={compactTick} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={(payload[0].payload as CashflowPoint).month.replace("-", "년 ") + "월"}
                    rows={[
                      { label: "수입", value: (payload[0].payload as CashflowPoint).income, color: SERIES.income },
                      { label: "지출", value: (payload[0].payload as CashflowPoint).expense, color: SERIES.expense },
                      { label: "저축·투자", value: (payload[0].payload as CashflowPoint).saving, color: SERIES.saving },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expense" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="saving" fill={SERIES.saving} radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface NetWorthChartPoint {
  label: string;
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

/** 순자산 추이 — 단일 계열 영역 */
export function NetWorthChart({ data, height = 200 }: { data: NetWorthChartPoint[]; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.netWorth} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES.netWorth} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} width={48} tickFormatter={compactTick} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as NetWorthChartPoint;
              return (
                <TooltipBox
                  title={p.month.replace("-", "년 ") + "월 말"}
                  rows={[
                    { label: "순자산", value: p.netWorth, color: SERIES.netWorth },
                    { label: "자산", value: p.assets },
                    { label: "부채", value: p.liabilities },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke={SERIES.netWorth}
            strokeWidth={2}
            fill="url(#nw-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
