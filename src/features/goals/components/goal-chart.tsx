"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, compactTick, gridProps, Legend, SERIES, TooltipBox } from "@/components/charts/chart-kit";

export interface GoalChartPoint {
  label: string;
  /** 현재 배분액 유지 시 */
  projected: number;
  /** 필요액 납입 시 */
  required: number | null;
  target: number;
}

export function GoalProjectionChart({ data, showRequired }: { data: GoalChartPoint[]; showRequired: boolean }) {
  return (
    <div className="grid gap-3">
      <Legend
        items={[
          { label: "현재 배분액 유지", color: SERIES.principal },
          ...(showRequired ? [{ label: "필요액 납입", color: SERIES.saving }] : []),
          { label: "목표 금액", color: SERIES.target, dashed: true },
        ]}
      />
      <div className="h-60 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={52} tickFormatter={compactTick} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as GoalChartPoint;
                return (
                  <TooltipBox
                    title={p.label}
                    rows={[
                      { label: "현재 배분액 유지", value: p.projected, color: SERIES.principal },
                      ...(showRequired && p.required !== null ? [{ label: "필요액 납입", value: p.required, color: SERIES.saving }] : []),
                      { label: "목표 금액", value: p.target },
                    ]}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="target" stroke={SERIES.target} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
            {showRequired ? (
              <Line type="monotone" dataKey="required" stroke={SERIES.saving} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} />
            ) : null}
            <Line type="monotone" dataKey="projected" stroke={SERIES.principal} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
