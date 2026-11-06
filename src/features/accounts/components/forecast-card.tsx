import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bigOutflowsBefore, type AccountForecast } from "@/lib/finance/forecast";
import { formatCompactKRW } from "@/lib/finance/money";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const day = (d: string) => `${Number(d.slice(8, 10))}일`;

/** 30일 잔액 선 — 0 아래는 빨강 영역, 가장 낮은 날 점 */
function Spark({ f }: { f: AccountForecast }) {
  const W = 300;
  const H = 64;
  const values = f.points.map((p) => Number(p.balance));
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lowIndex = f.points.findIndex((p) => p.date === f.low.date);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      {min < 0 ? <rect x={0} y={y(0)} width={W} height={H - y(0)} className="fill-critical/10" /> : null}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" className={f.shortfall ? "stroke-critical" : "stroke-brand"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={x(lowIndex)} cy={y(values[lowIndex])} r={3} className={f.shortfall ? "fill-critical" : "fill-brand"} />
    </svg>
  );
}

/** 자산 화면 — 앞으로 30일 통장 잔액 예보 (입출금 통장·현금) */
export function ForecastCard({ forecasts }: { forecasts: AccountForecast[] }) {
  if (!forecasts.length) return null;
  const end = forecasts[0].points[forecasts[0].points.length - 1].date;
  return (
    <Card>
      <CardHeader>
        <CardTitle>앞으로 30일 통장 잔액</CardTitle>
        <CardDescription>정기 거래·카드 대금·평소 쓰는 돈으로 예상했어요 · {md(end)}까지</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {forecasts.map((f) => {
          const causes = f.shortfall ? bigOutflowsBefore(f, f.shortfall.date) : [];
          return (
            <div key={f.id} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  오늘 <Money value={f.start} compact />
                </span>
              </div>
              <Spark f={f} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{md(f.points[0].date)}</span>
                <span>{md(f.points[Math.floor(f.points.length / 2)].date)}</span>
                <span>{md(end)}</span>
              </div>
              {f.shortfall ? (
                <p className="text-sm">
                  <span className="font-semibold text-critical">
                    {day(f.shortfall.date)}에 <Money value={f.shortfall.amount} compact /> 모자랄 것 같아요
                  </span>
                  {causes.length ? (
                    <span className="block text-xs text-muted-foreground">
                      {causes.map((e) => `${day(e.date)} ${e.label} ${formatCompactKRW(-e.amount)}`).join(" · ")}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  가장 낮을 때 {md(f.low.date)} <Money value={f.low.balance} compact />
                </p>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">예상이에요. 정기 거래로 등록하지 않은 큰 지출은 들어 있지 않아요.</p>
      </CardContent>
    </Card>
  );
}
