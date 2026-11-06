"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, compactTick, gridProps, Legend, SERIES, TooltipBox } from "@/components/charts/chart-kit";
import { Money } from "@/components/common/money";
import type { DateStr } from "@/lib/finance/types";

export interface GoalHistoryPoint {
  date: DateStr;
  actual: number;
  plan: number;
}

const label = (d: DateStr) => `${d.slice(2, 4)}.${d.slice(5, 7)}`;

/** 기준일부터 오늘까지 — 계획선(점선) 대비 실제 모인 돈(실선) */
export function GoalHistoryChart({ points }: { points: GoalHistoryPoint[] }) {
  const last = points[points.length - 1];
  const gap = last.actual - last.plan;
  const data = points.map((p, i) => ({ ...p, label: i === points.length - 1 ? "오늘" : label(p.date) }));
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        {Math.abs(gap) < 10_000 ? (
          <span className="font-medium text-good">계획대로 모으고 있어요</span>
        ) : gap > 0 ? (
          <span className="font-medium text-good">
            계획보다 <Money value={gap} compact /> 앞서 있어요
          </span>
        ) : (
          <span className="font-medium text-warning">
            계획보다 <Money value={-gap} compact /> 뒤처져 있어요
          </span>
        )}
      </p>
      <Legend
        items={[
          { label: "실제 모인 돈", color: SERIES.principal },
          { label: "계획", color: SERIES.target, dashed: true },
        ]}
      />
      <div className="h-52 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={52} tickFormatter={compactTick} domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as GoalHistoryPoint & { label: string };
                return (
                  <TooltipBox
                    title={p.date.replaceAll("-", ".")}
                    rows={[
                      { label: "실제 모인 돈", value: p.actual, color: SERIES.principal },
                      { label: "계획", value: p.plan },
                    ]}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey="actual" stroke="none" fill={SERIES.principal} fillOpacity={0.12} activeDot={false} />
            <Line type="monotone" dataKey="plan" stroke={SERIES.target} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={SERIES.principal}
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === data.length - 1 && props.cx !== undefined && props.cy !== undefined ? (
                  <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={SERIES.principal} stroke="var(--background)" strokeWidth={2} />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
