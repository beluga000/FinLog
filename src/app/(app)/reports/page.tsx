import Link from "next/link";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccountOverview } from "@/features/accounts/queries";
import { CashflowTrendChart, NetWorthChart } from "@/features/dashboard/components/charts";
import { BucketCompare, DeltaLine, IncomeFlowBar, MetricCard } from "@/features/dashboard/components/widgets";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { getGoalsOverview } from "@/features/goals/queries";
import { getScopedTransactions } from "@/features/ledger/queries";
import { getMonthlyClosing } from "@/features/reports/closing";
import { ClosingCard } from "@/features/reports/components/closing-card";
import { requireHousehold } from "@/lib/db/context";
import { formatPercent } from "@/lib/finance/money";
import { getMonthKey, getMonthRange, parseMonthKey, todayKST } from "@/lib/finance/period";
import { compareMonths, delta } from "@/lib/finance/stats";
import { parseViewScope } from "@/lib/finance/visibility";
import { SCOPE_LABEL } from "@/lib/labels";

export const metadata = { title: "리포트" };

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

  // 월간 결산은 이번 달을 볼 때만 최상단에 (§4-7)
  const closingP =
    month === thisMonth
      ? getGoalsOverview(ctx, { today, monthStartDay }).then(({ goals }) => getMonthlyClosing(ctx, { today, monthStartDay, goals }))
      : Promise.resolve(null);
  const [series, overview, current, closing] = await Promise.all([
    getMonthlySeries(ctx, scope, { endMonth: month, count: 12, monthStartDay }),
    getAccountOverview(ctx, scope, { today, monthStartDay, trendMonths: 12 }),
    getScopedTransactions(ctx, getMonthRange(month, monthStartDay), scope),
    closingP,
  ]);

  const cur = series[series.length - 1].stats;
  const prev = series[series.length - 2].stats;
  const cmp = compareMonths(cur, prev);
  const nwTrend = overview.trend;
  const nwDelta = nwTrend.length > 1 ? delta(nwTrend[nwTrend.length - 1].netWorth, nwTrend[nwTrend.length - 2].netWorth) : null;
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const qs = scope === "us" ? "" : `?scope=${scope}`;
  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];
  const empty = series.every((s) => s.stats.income === 0n && s.stats.expense === 0n && s.stats.saving === 0n);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{ctx.isCouple ? `${scopeLabel}의 ` : ""}리포트</h1>
          <p className="text-sm text-muted-foreground">{ctx.household.name}</p>
        </div>
        <MonthNav month={month} monthStartDay={monthStartDay} basePath="/reports" params={{ scope: scope === "us" ? undefined : scope }} />
      </div>

      {closing ? <ClosingCard closing={closing} /> : null}

      {empty ? (
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
          기록이 쌓이면 통계를 보여드려요. 오늘 쓴 돈부터 기록해 보세요.
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="이번 달 요약">
            <MetricCard label="순자산" value={<Money value={overview.netWorth.netWorth} compact />} delta={nwDelta} href={`/assets${qs}`} />
            <MetricCard label="수입" value={<Money value={cur.income} compact />} delta={cmp.income} />
            <MetricCard label="지출" value={<Money value={cur.expense} compact />} delta={cmp.expense} invert />
            <MetricCard label="저축·투자" value={<Money value={cur.saving} compact />} delta={cmp.saving} />
            <MetricCard label="저축률" value={formatPercent(cur.savingsRate, 0)} />
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
