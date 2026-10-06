import Link from "next/link";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccountOverview } from "@/features/accounts/queries";
import { CashflowTrendChart, NetWorthChart } from "@/features/dashboard/components/charts";
import { BucketCompare, Checklist, DeltaLine, IncomeFlowBar, MetricCard } from "@/features/dashboard/components/widgets";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { GoalMiniList } from "@/features/goals/components/goal-mini-list";
import { getGoalsOverview } from "@/features/goals/queries";
import { getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { formatPercent } from "@/lib/finance/money";
import { getMonthKey, getMonthRange, parseMonthKey } from "@/lib/finance/period";
import { compareMonths, delta } from "@/lib/finance/stats";
import { todayKST } from "@/lib/finance/period";
import { parseViewScope } from "@/lib/finance/visibility";
import { SCOPE_LABEL } from "@/lib/labels";

export const metadata = { title: "홈" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string }>;
}) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const { monthStartDay } = ctx.household;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : getMonthKey(today, monthStartDay);

  await materializeRecurring(ctx.householdId, today);

  const [series, overview, goals, current, ruleCount] = await Promise.all([
    getMonthlySeries(ctx, scope, { endMonth: month, count: 12, monthStartDay }),
    getAccountOverview(ctx, scope, { today, monthStartDay, trendMonths: 12 }),
    getGoalsOverview(ctx, { today, monthStartDay }),
    getScopedTransactions(ctx, getMonthRange(month, monthStartDay), scope),
    prisma.recurringRule.count({ where: { householdId: ctx.householdId, isActive: true } }),
  ]);

  const cur = series[series.length - 1].stats;
  const prev = series[series.length - 2].stats;
  const cmp = compareMonths(cur, prev);
  const nwTrend = overview.trend;
  const nwDelta = nwTrend.length > 1 ? delta(nwTrend[nwTrend.length - 1].netWorth, nwTrend[nwTrend.length - 2].netWorth) : null;
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const qs = scope === "us" ? "" : `?scope=${scope}`;

  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{ctx.isCouple ? `${scopeLabel}의 ` : ""}돈 흐름</h1>
          <p className="text-sm text-muted-foreground">{ctx.household.name}</p>
        </div>
        <MonthNav month={month} monthStartDay={monthStartDay} basePath="/dashboard" params={{ scope: scope === "us" ? undefined : scope }} />
      </div>

      <Checklist
        items={[
          { done: overview.accounts.length > 0, label: "통장·카드 계좌 등록하기", href: "/assets" },
          { done: ruleCount > 0, label: "월급·고정비를 정기 거래로 등록하기", href: "/ledger/recurring" },
          { done: goals.goals.length > 0, label: "첫 목표 정하기", href: "/goals" },
          { done: ctx.isCouple, label: "배우자 초대하기 (선택)", href: "/settings" },
        ]}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="이번 달 요약">
        <MetricCard
          label="순자산"
          value={<Money value={overview.netWorth.netWorth} compact />}
          delta={nwDelta}
          href={`/assets${qs}`}
        />
        <MetricCard label="수입" value={<Money value={cur.income} compact />} delta={cmp.income} />
        <MetricCard label="지출" value={<Money value={cur.expense} compact />} delta={cmp.expense} invert />
        <MetricCard
          label="저축률"
          value={formatPercent(cur.savingsRate, 0)}
          sub={<>저축·투자 <Money value={cur.saving} compact /></>}
        />
      </section>

      {summaryOnlyTotal > 0n ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {ctx.partner?.name ?? "배우자"}님의 &lsquo;합계만 공개&rsquo; 지출 <Money value={summaryOnlyTotal} />이 합계에 포함되어 있어요 (건별 내역은 비공개).
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>수입은 어디로 갔나</CardTitle>
          </CardHeader>
          <CardContent>
            <IncomeFlowBar stats={cur} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>50 / 30 / 20 비교</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketCompare stats={cur} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>지출 Top 5</CardTitle>
            <CardAction>
              <Link href={`/ledger?month=${month}${scope === "us" ? "" : `&scope=${scope}`}`} className="text-xs text-muted-foreground hover:underline">
                내역 보기
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {cmp.topExpenses.length ? (
              <ol className="grid gap-3">
                {cmp.topExpenses.map((c, i) => (
                  <li key={c.categoryId ?? "none"} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">
                        <span className="mr-1.5 text-xs text-muted-foreground tabular">{i + 1}</span>
                        {c.name}
                      </span>
                      <Money value={c.amount} className="font-semibold" />
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full" style={{ width: `${(c.share ?? 0) * 100}%`, background: "var(--chart-2)" }} />
                    </div>
                    <DeltaLine delta={c.delta} invert />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">이번 달 지출 기록이 없어요.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>최근 12개월</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowTrendChart
              data={series.map((s) => ({
                month: s.month,
                label: `${parseMonthKey(s.month).m}월`,
                income: Number(s.stats.income),
                expense: Number(s.stats.expense),
                saving: Number(s.stats.saving),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>순자산 추이</CardTitle>
            <CardAction>
              <Link href={`/assets${qs}`} className="text-xs text-muted-foreground hover:underline">
                자산 보기
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <NetWorthChart
              data={nwTrend.map((p) => ({
                month: p.month,
                label: `${parseMonthKey(p.month).m}월`,
                netWorth: Number(p.netWorth),
                assets: Number(p.assets),
                liabilities: Number(p.liabilities),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>목표</CardTitle>
            <CardAction>
              <Link href="/goals" className="text-xs text-muted-foreground hover:underline">
                전체 보기
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <GoalMiniList goals={goals.goals.filter((g) => g.status === "ACTIVE").slice(0, 3)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
