"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { axisProps, compactTick, gridProps, Legend, SERIES, TooltipBox } from "@/components/charts/chart-kit";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/finance/money";
import { MODEL_ALLOCATIONS, portfolioMetrics, RISK_PROFILE_LABEL, RISK_PROFILES } from "@/lib/finance/portfolio";
import { predictAssetGrowth } from "@/lib/finance/projection";

const PRESETS = RISK_PROFILES.map((p) => ({
  key: p,
  label: RISK_PROFILE_LABEL[p],
  rate: Math.round(portfolioMetrics(MODEL_ALLOCATIONS[p]).expectedReturn * 1000) / 10,
}));

function Slider({
  id,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-[var(--chart-1)]"
      />
      <span className="w-16 text-right text-sm font-semibold tabular">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function Simulator({ defaultPv, defaultPmt }: { defaultPv: number; defaultPmt: number }) {
  const [pv, setPv] = useState(String(Math.max(0, Math.round(defaultPv))));
  const [pmt, setPmt] = useState(String(Math.max(0, Math.round(defaultPmt))));
  const [rate, setRate] = useState(PRESETS[2].rate);
  const [years, setYears] = useState(10);
  const [inflation, setInflation] = useState(2.5);
  const [growth, setGrowth] = useState(0);
  const [real, setReal] = useState(true);

  // 슬라이더 조작마다 클라이언트에서 즉시 재계산 (서버 왕복 없음)
  const result = useMemo(
    () =>
      predictAssetGrowth({
        pv: Number(pv || 0),
        pmt: Number(pmt || 0),
        annualReturn: rate / 100,
        years,
        inflation: inflation / 100,
        pmtGrowth: growth / 100,
      }),
    [pv, pmt, rate, years, inflation, growth],
  );

  const data = result.points.map((p) => ({
    label: `${p.year}년`,
    year: p.year,
    contributed: p.contributed,
    gain: Math.max(0, p.gain),
    balance: p.balance,
    balanceReal: p.balanceReal,
  }));

  const headline = real ? result.finalBalanceReal : result.finalBalance;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardContent className="grid gap-5">
          <Field label="현재 자산" htmlFor="pv" hint="기본값: 현재 순자산">
            <AmountInput id="pv" value={pv} onChange={setPv} />
          </Field>
          <Field label="매달 저축·투자" htmlFor="pmt" hint="기본값: 최근 3개월 평균 저축액">
            <AmountInput id="pmt" value={pmt} onChange={setPmt} quickAdd={[100_000, 500_000, 1_000_000]} />
          </Field>
          <Field label="기대수익률 (연)" htmlFor="rate">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setRate(p.rate)}
                  aria-pressed={rate === p.rate}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    rate === p.rate ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p.label} {p.rate}%
                </button>
              ))}
            </div>
            <Slider id="rate" value={rate} onChange={setRate} min={-5} max={15} step={0.1} suffix="%" />
          </Field>
          <Field label="기간" htmlFor="years">
            <Slider id="years" value={years} onChange={setYears} min={1} max={40} step={1} suffix="년" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="물가상승률" htmlFor="infl">
              <Slider id="infl" value={inflation} onChange={setInflation} min={0} max={6} step={0.1} suffix="%" />
            </Field>
            <Field label="납입액 연 증가" htmlFor="growth" hint="연봉 인상분 반영">
              <Slider id="growth" value={growth} onChange={setGrowth} min={0} max={10} step={0.5} suffix="%" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">{years}년 뒤 예상 자산 ({real ? "오늘 돈 가치" : "명목 금액"})</div>
                <div className="text-3xl font-black md:text-4xl"><Money value={headline} /></div>
                <div className="text-sm text-muted-foreground">
                  {real ? (
                    <>명목 <Money value={result.finalBalance} compact /></>
                  ) : (
                    <>오늘 가치 <Money value={result.finalBalanceReal} compact /></>
                  )}
                </div>
              </div>
              <div role="radiogroup" aria-label="금액 기준" className="inline-flex rounded-lg bg-muted p-[3px] text-xs">
                {[
                  { v: true, l: "오늘 가치" },
                  { v: false, l: "명목" },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    role="radio"
                    aria-checked={real === o.v}
                    onClick={() => setReal(o.v)}
                    className={cn("rounded-md px-2.5 py-1", real === o.v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">총 납입 원금</dt>
                <dd className="font-semibold"><Money value={result.totalContributed} compact /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">수익 (명목)</dt>
                <dd className="font-semibold"><Money value={result.totalGain} compact /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">누적 수익률</dt>
                <dd className="font-semibold">{formatPercent(result.cumulativeReturn)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>자산 증가 곡선</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {real ? (
              <Legend items={[{ label: "오늘 가치", color: SERIES.principal }, { label: "명목 금액", color: SERIES.target, dashed: true }]} />
            ) : (
              <Legend items={[{ label: "납입 원금", color: SERIES.principal }, { label: "수익", color: SERIES.gain }]} />
            )}
            <div className="h-64 w-full">
              <ResponsiveContainer>
                {real ? (
                  <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis {...axisProps} width={52} tickFormatter={compactTick} />
                    <Tooltip
                      cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof data)[number];
                        return (
                          <TooltipBox
                            title={`${p.year}년 뒤`}
                            rows={[
                              { label: "오늘 가치", value: p.balanceReal, color: SERIES.principal },
                              { label: "명목 금액", value: p.balance },
                              { label: "납입 원금", value: p.contributed },
                            ]}
                          />
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="balanceReal" stroke={SERIES.principal} strokeWidth={2} fill={SERIES.principal} fillOpacity={0.15} />
                    <Line type="monotone" dataKey="balance" stroke={SERIES.target} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                ) : (
                  <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis {...axisProps} width={52} tickFormatter={compactTick} />
                    <Tooltip
                      cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof data)[number];
                        return (
                          <TooltipBox
                            title={`${p.year}년 뒤`}
                            rows={[
                              { label: "합계", value: p.balance },
                              { label: "납입 원금", value: p.contributed, color: SERIES.principal },
                              { label: "수익", value: p.gain, color: SERIES.gain },
                            ]}
                          />
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="contributed" stackId="1" stroke={SERIES.principal} strokeWidth={2} fill={SERIES.principal} fillOpacity={0.25} />
                    <Area type="monotone" dataKey="gain" stackId="1" stroke={SERIES.gain} strokeWidth={2} fill={SERIES.gain} fillOpacity={0.25} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">표로 보기</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-right tabular">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 text-left font-medium">연차</th>
                      <th className="font-medium">원금</th>
                      <th className="font-medium">명목</th>
                      <th className="font-medium">오늘 가치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.points.slice(1).map((p) => (
                      <tr key={p.year} className="border-b last:border-0">
                        <td className="py-1 text-left">{p.year}년</td>
                        <td><Money value={p.contributed} compact /></td>
                        <td><Money value={p.balance} compact /></td>
                        <td><Money value={p.balanceReal} compact /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          매월 말 납입, 월 복리 (1+R)^(1/12)−1 기준. 세금·수수료 미반영. 투자 권유가 아닌 참고용 시뮬레이션이며, 과거 수익률이 미래 수익을 보장하지 않습니다.
        </p>
      </div>
    </div>
  );
}
