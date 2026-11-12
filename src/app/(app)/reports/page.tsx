import Link from "next/link";
import { ChevronRight, HandCoins } from "lucide-react";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { PrintButton } from "@/components/common/print-button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccountOverview } from "@/features/accounts/queries";
import { CashflowTrendChart, NetWorthChart } from "@/components/charts/lazy-charts";
import { BucketCompare, DeltaLine, IncomeFlowBar, MetricCard } from "@/features/dashboard/components/widgets";
import { getPlannedRest } from "@/features/dashboard/home";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { MoveToGoalButton } from "@/features/goals/components/move-to-goal";
import { getGoalsOverview, getMoveTarget } from "@/features/goals/queries";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { getMonthlyClosing } from "@/features/reports/closing";
import { ClosingCard } from "@/features/reports/components/closing-card";
import { requireHousehold } from "@/lib/db/context";
import { formatPercent } from "@/lib/finance/money";
import { samePeriodRange } from "@/lib/finance/month-progress";
import { getMonthKey, getMonthRange, parseMonthKey, shiftMonth, todayKST } from "@/lib/finance/period";
import { calculateMonthlyStats, compareMonths, delta } from "@/lib/finance/stats";
import { detectUnusualSpending } from "@/lib/finance/unusual-spending";
import type { DateStr } from "@/lib/finance/types";
import { parseViewScope } from "@/lib/finance/visibility";
import { formatCompactKRW } from "@/lib/finance/money";
import { SCOPE_LABEL, withRo } from "@/lib/labels";

export const metadata = { title: "리포트" };

/** "2026-11-25" → "25일" */
const dayLabel = (d: DateStr) => `${Number(d.slice(8))}일`;

/** 리포트 (PROD.MD §2-9) — 월간 결산(§4-7) + v2 대시보드의 통계 차트 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string }>;
}) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const { monthStartDay } = ctx.household;
  const thisMonth = getMonthKey(today, monthStartDay);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  const range = getMonthRange(month, monthStartDay);
  // 진행 중인 달은 지난달 같은 기간과 비교하고, 남은 정기 수입·저축을 예정으로 보여 준다 (월초에 "100% 감소"로 겁주지 않게)
  const partial = month === thisMonth ? samePeriodRange(range, getMonthRange(shiftMonth(month, -1), monthStartDay), today) : null;
  const prevPartialP = partial
    ? Promise.all([getScopedTransactions(ctx, partial, scope), getCategories(ctx)]).then(([{ items, summarized }, categories]) =>
        calculateMonthlyStats([...items, ...summarized], categories),
      )
    : Promise.resolve(null);
  const plannedP = partial ? getPlannedRest(ctx, scope, { today, range }) : Promise.resolve(null);

  // 월간 결산은 이번 달을 볼 때만 최상단에 (§4-7)
  const closingP =
    month === thisMonth
      ? getGoalsOverview(ctx, { today, monthStartDay }).then(({ goals }) => getMonthlyClosing(ctx, { today, monthStartDay, goals }))
      : Promise.resolve(null);
  const [series, overview, current, closing, prevPartial, planned] = await Promise.all([
    getMonthlySeries(ctx, scope, { endMonth: month, count: 12, monthStartDay }),
    getAccountOverview(ctx, scope, { today, monthStartDay, trendMonths: 12 }),
    getScopedTransactions(ctx, range, scope),
    closingP,
    prevPartialP,
    plannedP,
  ]);

  // 결산의 남은 돈 → 목표로 옮기기 기록
  const surplusGoal = closing && closing.surplus.amount >= 10_000n ? closing.surplus.goal : null;
  const [moveTarget, accounts, categories] = surplusGoal
    ? await Promise.all([getMoveTarget(ctx, surplusGoal), getAccounts(ctx, "us"), getCategories(ctx)])
    : [null, [], []];

  const cur = series[series.length - 1].stats;
  const prev = prevPartial ?? series[series.length - 2].stats;
  const cmp = compareMonths(cur, prev);
  const deltaLabel = partial ? "지난달 같은 기간 대비" : "전월 대비";
  const md = (d: DateStr) => `${Number(d.slice(5, 7))}월 ${dayLabel(d)}`;
  // 월 시작일이 1일이 아니면 두 달에 걸친다 ("10월 25일~11월 6일")
  const periodLabel = partial ? `${md(range.start)}~${range.start.slice(0, 7) === today.slice(0, 7) ? dayLabel(today) : md(today)}` : null;
  const nwTrend = overview.trend;
  const nwDelta = nwTrend.length > 1 ? delta(nwTrend[nwTrend.length - 1].netWorth, nwTrend[nwTrend.length - 2].netWorth) : null;
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const qs = scope === "us" ? "" : `?scope=${scope}`;
  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];
  const empty = series.every((s) => s.stats.income === 0n && s.stats.expense === 0n && s.stats.saving === 0n);
  // 평소와 다른 지출: 이 달 대분류별 지출 vs 직전 3달 평균
  const unusual = detectUnusualSpending(
    cur.expenseByTopCategory,
    series.slice(-4, -1).map((s) => ({ expense: s.stats.expense, byCategory: s.stats.expenseByTopCategory })),
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{ctx.isCouple ? `${scopeLabel}의 ` : ""}리포트</h1>
          <p className="text-sm text-muted-foreground">{ctx.household.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <div data-print="hide">
            <MonthNav month={month} monthStartDay={monthStartDay} basePath="/reports" params={{ scope: scope === "us" ? undefined : scope }} />
          </div>
        </div>
      </div>

      {closing ? (
        <ClosingCard
          closing={closing}
          surplusAction={
            moveTarget && surplusGoal ? (
              <MoveToGoalButton
                target={moveTarget}
                amount={(closing.surplus.amount / 10_000n) * 10_000n}
                label={`${withRo(surplusGoal.name)} 옮기기 기록`}
                variant="outline"
                accounts={accounts}
                categories={categories}
                viewerId={ctx.userId}
                isCouple={ctx.isCouple}
              />
            ) : null
          }
        />
      ) : null}

      {ctx.isCouple ? (
        <Link href="/reports/settle" data-print="hide" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="transition-colors group-hover:bg-muted/40">
            <CardContent className="flex items-center gap-3">
              <HandCoins className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">정산</div>
                <div className="truncate text-sm text-muted-foreground">각자 낸 생활비를 반반·수입 비율로 맞춰요</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ) : null}

      {periodLabel && !empty ? (
        <p className="text-xs text-muted-foreground">진행 중인 달이에요. {periodLabel} 기록을 지난달 같은 기간과 비교해요.</p>
      ) : null}

      {empty ? (
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
          기록이 쌓이면 통계를 보여드려요. 오늘 쓴 돈부터 기록해 보세요.
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="이번 달 요약">
            {/* 모바일 2열에서 5개째가 혼자 남지 않도록 순자산을 한 줄 전체로 */}
            <div className="col-span-2 grid lg:col-span-1">
              <MetricCard hero label="순자산" value={<Money value={overview.netWorth.netWorth} compact />} delta={nwDelta} href={`/assets${qs}`} />
            </div>
            <MetricCard
              label="수입"
              value={<Money value={cur.income} compact />}
              delta={cmp.income}
              deltaLabel={deltaLabel}
              note={planned && planned.income > 0n ? <PlannedNote amount={planned.income} date={planned.incomeDate} /> : null}
            />
            <MetricCard label="지출" value={<Money value={cur.expense} compact />} delta={cmp.expense} deltaLabel={deltaLabel} invert />
            <MetricCard
              label="저축·투자"
              value={<Money value={cur.saving} compact />}
              delta={cmp.saving}
              deltaLabel={deltaLabel}
              note={planned && planned.saving > 0n ? <PlannedNote amount={planned.saving} date={planned.savingDate} /> : null}
            />
            <MetricCard label="저축률" value={formatPercent(cur.savingsRate, 0)} />
          </section>

          {summaryOnlyTotal > 0n ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {ctx.partner?.name ?? "배우자"}님의 &lsquo;합계만 공개&rsquo; 지출 <Money value={summaryOnlyTotal} />이 합계에 포함되어 있어요 (건별 내역은 비공개).
            </p>
          ) : null}

          {unusual.length ? (
            <Card>
              <CardHeader>
                <CardTitle>평소와 다른 지출</CardTitle>
                <CardAction>
                  <Link href={`/ledger?month=${month}&type=expense${scope === "us" ? "" : `&scope=${scope}`}`} className="text-xs text-muted-foreground hover:underline">
                    내역 보기
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {unusual.map((u) => (
                    <li key={u.categoryId ?? "none"} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>
                        <span className="font-medium">{u.name}</span>{" "}
                        <span className="text-muted-foreground">
                          {u.rate === null
                            ? "평소엔 없던 지출이에요"
                            : `최근 3달 평균 ${formatCompactKRW(u.average)}보다 ${Math.round(u.rate * 100)}% 많아요`}
                        </span>
                      </span>
                      <Money value={u.amount} compact className="font-semibold" />
                    </li>
                  ))}
                </ul>
                {partial ? <p className="mt-3 text-xs text-muted-foreground">진행 중인 달인데 벌써 평소보다 많이 썼어요.</p> : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>수입은 어디로 갔나</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeFlowBar stats={cur} pendingIncome={planned?.income ?? 0n} expenseHref={`/ledger?month=${month}&type=expense`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>50 / 30 / 20 비교</CardTitle>
              </CardHeader>
              <CardContent>
                <BucketCompare stats={cur} expenseHref={`/ledger?month=${month}&type=expense`} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
            <Card>
              <CardHeader>
                <CardTitle>지출 Top 5</CardTitle>
                <CardAction>
                  <Link
                    href={`/ledger?month=${month}${scope === "us" ? "" : `&scope=${scope}`}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
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
                          <Money value={c.amount} compact className="font-semibold" />
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full" style={{ width: `${(c.share ?? 0) * 100}%`, background: "var(--chart-2)" }} />
                        </div>
                        <DeltaLine delta={c.delta} invert label={deltaLabel} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">이 달 지출 기록이 없어요.</p>
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
        </>
      )}
    </div>
  );
}

function PlannedNote({ amount, date }: { amount: bigint; date: DateStr | null }) {
  return (
    <>
      {date ? `${dayLabel(date)} ` : ""}
      <Money value={amount} compact /> 예정
    </>
  );
}
