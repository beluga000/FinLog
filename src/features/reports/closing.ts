import "server-only";
import { computeSpendable, getSpendableSource, getStaleBalanceAccounts } from "@/features/dashboard/home";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { DEFAULT_INFLATION, type GoalView } from "@/features/goals/queries";
import { getAccountFlows, getAccounts } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { computeBalances, summarizeNetWorth } from "@/lib/finance/balance";
import { describeAheadChange, suggestAdjustments, type ClosingSuggestion } from "@/lib/finance/closing";
import { evaluateGoal } from "@/lib/finance/goals";
import { addDays, getMonthKey, getMonthRange, shiftMonth } from "@/lib/finance/period";
import type { DateStr, MonthKey } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export interface MonthlyClosing {
  month: MonthKey;
  savingsRate: number | null;
  saving: { actual: bigint; planned: bigint };
  /** 지난달 쓸 수 있는 돈 결과 — 양수 = 남김, 음수 = 초과 */
  spendableResult: bigint;
  primaryGoal: { id: string; name: string; pace: string | null } | null;
  suggestions: ClosingSuggestion[];
}

/**
 * 지난달 월간 결산 (PROD.MD §4-7). 조회 시점에 계산하고 저장하지 않는다.
 * 부부 모두 같은 결산을 본다 → "우리" 범위(내 공개범위 기준)로 계산.
 * 목표 저축 계획값은 지금 목표 설정 기준이다 (과거 설정은 남기지 않음).
 * 지난달 기록이 하나도 없으면 null (가입 첫 달).
 */
export async function getMonthlyClosing(
  ctx: Ctx,
  opts: { today: DateStr; monthStartDay: number; goals: GoalView[] },
): Promise<MonthlyClosing | null> {
  const { today, monthStartDay, goals } = opts;
  const month = shiftMonth(getMonthKey(today, monthStartDay), -1);
  const before = shiftMonth(month, -1);

  const [series, lastSource, prevSource, stale, accounts] = await Promise.all([
    getMonthlySeries(ctx, "us", { endMonth: month, count: 2, monthStartDay }),
    getSpendableSource(ctx, "us", { today, monthStartDay, goals, month }),
    getSpendableSource(ctx, "us", { today, monthStartDay, goals, month: before }),
    getStaleBalanceAccounts(ctx, { today }),
    getAccounts(ctx, "us"),
  ]);
  const [prevStats, stats] = [series[0].stats, series[1].stats];
  if (stats.income === 0n && stats.expense === 0n && stats.saving === 0n) return null;

  const last = computeSpendable(lastSource);
  const prev = computeSpendable(prevSource);
  const planned = last.goalSaving;
  const prevHasData = prevStats.income > 0n || prevStats.expense > 0n || prevStats.saving > 0n;

  // 대표 목표 앞섬·뒤처짐: 결산 달 말일 vs 그 전달 말일 기준 잔액으로 다시 평가
  const primary = goals.find((g) => g.status === "ACTIVE") ?? null;
  let pace: string | null = null;
  if (primary) {
    const ids = accounts.map((a) => a.id);
    const { snapshots, flows } = await getAccountFlows(ctx, ids, today);
    const trackingStart = snapshots.reduce<DateStr | null>((m, s) => (m === null || s.asOf < m ? s.asOf : m), null);
    const aheadAt = (asOf: DateStr) => {
      if (trackingStart === null || asOf < trackingStart) return undefined;
      const balances = computeBalances(ids, snapshots, flows, asOf);
      const current = primary.usesNetWorth
        ? Math.max(0, Number(summarizeNetWorth(accounts, balances).netWorth))
        : primary.linkedAccountIds.reduce((s, id) => s + Number(balances.get(id) ?? 0n), 0);
      return evaluateGoal({
        target: primary.targetAmount,
        targetIsReal: primary.targetIsReal,
        targetDate: primary.targetDate,
        expectedReturn: primary.expectedReturn,
        current,
        monthlyContribution: primary.contribution,
        today: asOf,
        inflation: DEFAULT_INFLATION,
      }).aheadMonths;
    };
    const ahead = aheadAt(addDays(getMonthRange(month, monthStartDay).end, -1));
    const prevAhead = aheadAt(addDays(getMonthRange(before, monthStartDay).end, -1));
    pace = ahead === undefined ? null : describeAheadChange(ahead, prevAhead ?? null);
  }

  const prevByCat = new Map(prevStats.expenseByTopCategory.map((c) => [c.categoryId, c.amount]));
  const suggestions = suggestAdjustments({
    overspent: last.overspent,
    categoryDiffs: stats.expenseByTopCategory.map((c) => ({ name: c.name, diff: c.amount - (prevByCat.get(c.categoryId) ?? 0n) })),
    compared: prevHasData,
    savingShort: [prevHasData && planned > 0n && prevStats.saving < prev.goalSaving, planned > 0n && stats.saving < planned],
    primaryGoal: primary ? { id: primary.id, name: primary.name } : null,
    staleAccounts: stale,
    ledgerHref: `/ledger?month=${month}`,
  });

  return {
    month,
    savingsRate: stats.savingsRate,
    saving: { actual: stats.saving, planned },
    spendableResult: last.remaining,
    primaryGoal: primary ? { id: primary.id, name: primary.name, pace } : null,
    suggestions,
  };
}
