import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Check, Circle } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/finance/money";
import type { Delta, MonthlyStats } from "@/lib/finance/stats";

export function MetricCard({
  label,
  value,
  sub,
  delta,
  invert,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: Delta | null;
  /** 지출처럼 늘어나면 나쁜 지표 */
  invert?: boolean;
  href?: string;
}) {
  const body = (
    <Card size="sm" className="h-full">
      <CardContent className="grid gap-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold md:text-xl">{value}</div>
        {delta ? <DeltaLine delta={delta} invert={invert} /> : sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function DeltaLine({ delta, invert, label = "전월 대비" }: { delta: Delta; invert?: boolean; label?: string }) {
  if (delta.diff === 0n) return <div className="text-xs text-muted-foreground">{label} 변화 없음</div>;
  const up = delta.diff > 0n;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      <span className={cn("inline-flex items-center font-medium", good ? "text-good" : "text-critical")}>
        <Icon className="size-3.5" aria-hidden />
        <Money value={delta.diff < 0n ? -delta.diff : delta.diff} compact />
        {delta.rate !== null ? ` (${formatPercent(Math.abs(delta.rate), 0)})` : ""}
      </span>
      <span className="sr-only">{up ? "증가" : "감소"}</span>
    </div>
  );
}

/** 수입이 어디로 갔나: 지출 / 저축 / 남은 돈 — 100% 누적 막대 (2px 간격) */
export function IncomeFlowBar({ stats }: { stats: MonthlyStats }) {
  const income = Number(stats.income);
  const parts = [
    { label: "지출", value: Number(stats.expense), color: "var(--chart-2)" },
    { label: "저축·투자", value: Number(stats.saving), color: "var(--chart-3)" },
    { label: "남은 돈", value: Math.max(0, Number(stats.remaining)), color: "var(--chart-grid)" },
  ];
  const total = Math.max(income, parts[0].value + parts[1].value);
  if (total <= 0) return <p className="text-sm text-muted-foreground">이번 달 기록이 아직 없어요.</p>;
  return (
    <div className="grid gap-3">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {parts.map((p) =>
          p.value > 0 ? (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} ${formatPercent(p.value / total)}`} />
          ) : null,
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {parts.map((p) => (
          <div key={p.label} className="grid gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </dt>
            <dd className="font-semibold">
              <Money value={p.value} compact />
              <span className="ml-1 text-xs font-normal text-muted-foreground">{income > 0 ? formatPercent(p.value / income, 0) : ""}</span>
            </dd>
          </div>
        ))}
      </dl>
      {stats.remaining < 0n ? (
        <p className="text-xs text-critical">수입보다 <Money value={-stats.remaining} /> 더 썼어요.</p>
      ) : null}
    </div>
  );
}

/** 50/30/20 비교 — 실제 비율 막대 + 기준선 */
export function BucketCompare({ stats }: { stats: MonthlyStats }) {
  const rows = [
    { key: "NEEDS", label: "필수 지출", target: 0.5, actual: stats.bucketRatios.NEEDS, amount: stats.buckets.NEEDS, good: "under" },
    { key: "WANTS", label: "선택 지출", target: 0.3, actual: stats.bucketRatios.WANTS, amount: stats.buckets.WANTS + stats.buckets.UNCLASSIFIED, good: "under" },
    { key: "SAVINGS", label: "저축·투자", target: 0.2, actual: stats.bucketRatios.SAVINGS, amount: stats.buckets.SAVINGS, good: "over" },
  ] as const;
  if (stats.income === 0n) return <p className="text-sm text-muted-foreground">수입을 기록하면 50/30/20 기준과 비교해 드려요.</p>;
  return (
    <div className="grid gap-3">
      {rows.map((r) => {
        const actual = r.actual ?? 0;
        const ok = r.good === "under" ? actual <= r.target : actual >= r.target;
        return (
          <div key={r.key} className="grid gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span>{r.label}</span>
              <span className="tabular">
                <span className="font-semibold">{formatPercent(actual, 0)}</span>
                <span className="text-xs text-muted-foreground"> / 기준 {formatPercent(r.target, 0)}</span>
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.min(100, actual * 100)}%`, background: "var(--chart-1)" }}
              />
              <div className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: `${r.target * 100}%` }} aria-hidden />
            </div>
            <div className={cn("text-xs", ok ? "text-muted-foreground" : "text-critical")}>
              <Money value={r.amount} compact /> · {ok ? "기준 충족" : r.good === "under" ? "기준 초과" : "기준 미달"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Checklist({ items }: { items: { done: boolean; label: string; href: string }[] }) {
  if (items.every((i) => i.done)) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>시작 체크리스트</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.map((i) => (
          <Link key={i.label} href={i.href} className="flex items-center gap-2 text-sm">
            {i.done ? <Check className="size-4 text-good" /> : <Circle className="size-4 text-muted-foreground" />}
            <span className={cn(i.done && "text-muted-foreground line-through")}>{i.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
