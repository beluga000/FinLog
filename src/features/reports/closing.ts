import "server-only";
import { computeSpendable, getSpendableSource, getStaleBalanceAccounts } from "@/features/dashboard/home";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { DEFAULT_INFLATION, type GoalView } from "@/features/goals/queries";
import { getAccountFlows, getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { balanceSeries, summarizeNetWorth } from "@/lib/finance/balance";
import {
  describeClosingPace,
  explainSpendableResult,
  findFrequentMerchant,
  findOneOffExpense,
  suggestAdjustments,
  type ClosingDriver,
  type ClosingExpense,
  type ClosingPace,
  type ClosingSuggestion,
} from "@/lib/finance/closing";
import { challengeLimit, countVisits, describeChallengeResult, type ChallengeResult } from "@/lib/finance/challenge";
import { evaluateGoal, goalCurrent, goalPaceKind } from "@/lib/finance/goals";
import { merchantKey } from "@/lib/finance/merchant-rules";
import { addDays, getMonthKey, getMonthRange, shiftMonth } from "@/lib/finance/period";
import { buildCategoryIndex, UNCATEGORIZED } from "@/lib/finance/stats";
import { getChallenges } from "./challenge";
import type { DateStr, MonthKey } from "@/lib/finance/types";
import { txAccess } from "@/lib/finance/visibility";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

/** 쓸 수 있는 돈 = 수입 − 고정 지출 − 저축 계획 − 생활비 */
export interface SpendableParts {
  income: bigint;
  fixed: bigint;
  plannedSaving: bigint;
  variable: bigint;
}
const partsOf = (s: { income: bigint; fixed: bigint; plannedSaving: bigint; variableExpense: bigint }): SpendableParts => ({
  income: s.income,
  fixed: s.fixed,
  plannedSaving: s.plannedSaving,
  variable: s.variableExpense,
});

export interface MonthlyClosing {
  month: MonthKey;
  savingsRate: number | null;
  saving: { actual: bigint; planned: bigint };
  /** 지난달 쓸 수 있는 돈 결과 — 양수 = 남김, 음수 = 초과 */
  spendableResult: bigint;
  /** "무엇 때문인지 보기" — 쓸 수 있는 돈 계산식 (전월 기록이 있으면 prev 도) */
  breakdown: { now: SpendableParts; prev: SpendableParts | null };
  /** 넘긴(남긴) 이유가 된 지출 카테고리 */
  drivers: ClosingDriver[];
  /** 결산 달 가계부 지출 목록 */
  ledgerHref: string;
  primaryGoal: { id: string; name: string; pace: ClosingPace | null } | null;
  suggestions: ClosingSuggestion[];
  /** 지난달 남긴 돈과 옮길 목표 — 결산 카드의 [옮기기 기록] 버튼용 */
  surplus: { amount: bigint; goal: { id: string; name: string; linkedAccountIds: string[] } | null };
  /** "같은 사용처 N번" 제안 → 이번 달 챌린지 (started = 이미 시작함) */
  challenge: { merchant: string; count: number; amount: bigint; limitCount: number; started: boolean } | null;
  /** 결산 달에 했던 챌린지 결과 */
  challengeResults: ChallengeResult[];
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
  const range = getMonthRange(month, monthStartDay);

  const [series, lastSource, prevSource, stale, accounts, monthTxs, categories, pendingReviews, pastChallenges, nowChallenges] = await Promise.all([
    getMonthlySeries(ctx, "us", { endMonth: month, count: 2, monthStartDay }),
    getSpendableSource(ctx, "us", { today, monthStartDay, goals, month }),
    getSpendableSource(ctx, "us", { today, monthStartDay, goals, month: before }),
    getStaleBalanceAccounts(ctx, { today }),
    getAccounts(ctx, "us"),
    getScopedTransactions(ctx, range, "us"),
    getCategories(ctx),
    countPendingReviews(ctx, range.end),
    getChallenges(ctx, month),
    getChallenges(ctx, shiftMonth(month, 1)),
  ]);
  const [prevStats, stats] = [series[0].stats, series[1].stats];
  if (stats.income === 0n && stats.expense === 0n && stats.saving === 0n) return null;

  const last = computeSpendable(lastSource);
  const prev = computeSpendable(prevSource);
  const planned = last.plannedSaving;
  const prevHasData = prevStats.income > 0n || prevStats.expense > 0n || prevStats.saving > 0n;

  // 대표 목표 앞섬·뒤처짐: 결산 달 말일 vs 그 전달 말일 기준 잔액으로 다시 평가
  const primary = goals.find((g) => g.status === "ACTIVE") ?? null;
  // 남은 돈은 연결 계좌가 있는 목표로만 옮기라고 제안한다 (순자산 목표는 옮겨도 진척이 같다)
  const surplusAmount = last.overspent ? 0n : last.remaining;
  const surplusGoal = primary && !primary.usesNetWorth && primary.linkedAccountIds.length ? primary : null;
  let pace: ClosingPace | null = null;
  let monthsSooner: number | null = null;
  if (primary) {
    const ids = accounts.map((a) => a.id);
    const { snapshots, flows } = await getAccountFlows(ctx, ids, today);
    const trackingStart = snapshots.reduce<DateStr | null>((m, s) => (m === null || s.asOf < m ? s.asOf : m), null);
    const monthEnd = addDays(range.end, -1);
    const prevEnd = addDays(getMonthRange(before, monthStartDay).end, -1);
    // 두 날짜 잔액을 한 번에 계산해 둔다
    const [endBalances, prevBalances] = balanceSeries(ids, snapshots, flows, [monthEnd, prevEnd]);
    const evaluateAt = (asOf: DateStr, extra = 0) => {
      if (trackingStart === null || asOf < trackingStart) return undefined;
      const balances = asOf === monthEnd ? endBalances : prevBalances;
      const basis = primary.usesNetWorth
        ? Number(summarizeNetWorth(accounts, balances).netWorth)
        : primary.linkedAccountIds.reduce((s, id) => s + Number(balances.get(id) ?? 0n), 0);
      // 목표 화면과 같은 기준 — 시작 금액 + 기준일 뒤 잔액 변화
      const current = extra + goalCurrent({ startAmount: primary.startAmount, baseBalance: primary.baseBalance }, basis);
      return evaluateGoal({
        target: primary.targetAmount,
        targetIsReal: primary.targetIsReal,
        targetDate: primary.targetDate,
        expectedReturn: primary.expectedReturn,
        current,
        monthlyContribution: primary.contribution,
        today: asOf,
        inflation: DEFAULT_INFLATION,
      });
    };
    const end = evaluateAt(monthEnd);
    const ahead = end?.aheadMonths;
    if (end) {
      pace = describeClosingPace({
        pace: goalPaceKind({ status: primary.status, contribution: primary.contribution, blockedBy: primary.blockedBy, evaluation: end }),
        ahead: end.aheadMonths,
        prevAhead: evaluateAt(prevEnd)?.aheadMonths ?? null,
        savingGap: planned - stats.saving,
      });
    }
    if (surplusGoal && surplusAmount > 0n && typeof ahead === "number") {
      const moved = evaluateAt(monthEnd, Number(surplusAmount))?.aheadMonths;
      if (typeof moved === "number" && moved > ahead) monthsSooner = moved - ahead;
    }
  }

  // 큰 지출 한 건·사용처 집중은 내용까지 볼 수 있는 거래로만 판단한다 (요약 공개 거래는 사용처가 없다)
  const index = buildCategoryIndex(categories);
  const expenses: ClosingExpense[] = monthTxs.items
    .filter((t) => t.type === "EXPENSE")
    .map((t) => ({
      merchant: t.merchant,
      categoryName: index.top(t.categoryId)?.name ?? UNCATEGORIZED,
      amount: t.amount,
      fixed: t.isFixed || t.recurringRuleId !== null,
      needs: index.bucketOf(t.categoryId) === "NEEDS",
    }));

  const frequent = findFrequentMerchant(expenses);
  const startedKeys = new Set(nowChallenges.map((c) => c.merchantKey));
  const challenge = frequent
    ? { ...frequent, merchant: frequent.name, limitCount: challengeLimit(frequent.count), started: startedKeys.has(merchantKey(frequent.name)) }
    : null;
  const monthMerchants = monthTxs.items.filter((t) => t.type === "EXPENSE").map((t) => t.merchant);
  const challengeResults = pastChallenges.map((c) =>
    describeChallengeResult({ ...c, actual: countVisits(monthMerchants, c.merchant) }),
  );

  const prevByCat = new Map(prevStats.expenseByTopCategory.map((c) => [c.categoryId, c.amount]));
  const oneOff = findOneOffExpense(expenses, stats.expense);
  const drivers = explainSpendableResult({
    overspent: last.overspent,
    current: stats.expenseByTopCategory,
    previous: prevStats.expenseByTopCategory,
    compared: prevHasData,
    oneOff: last.overspent ? oneOff : null,
  });
  const suggestions = suggestAdjustments({
    overspent: last.overspent,
    categoryDiffs: stats.expenseByTopCategory.map((c) => ({ name: c.name, diff: c.amount - (prevByCat.get(c.categoryId) ?? 0n) })),
    compared: prevHasData,
    savingShort: [prevHasData && planned > 0n && prevStats.saving < prev.plannedSaving, planned > 0n && stats.saving < planned],
    primaryGoal: primary ? { id: primary.id, name: primary.name } : null,
    staleAccounts: stale,
    ledgerHref: `/ledger?month=${month}`,
    oneOff,
    frequentMerchant: frequent,
    pendingReviews,
    surplus: { amount: surplusAmount, goal: surplusGoal ? { id: surplusGoal.id, name: surplusGoal.name, monthsSooner } : null },
  });

  return {
    month,
    savingsRate: stats.savingsRate,
    saving: { actual: stats.saving, planned },
    spendableResult: last.remaining,
    breakdown: { now: partsOf(last), prev: prevHasData ? partsOf(prev) : null },
    drivers,
    ledgerHref: `/ledger?month=${month}&type=expense`,
    primaryGoal: primary ? { id: primary.id, name: primary.name, pace } : null,
    suggestions,
    surplus: {
      amount: surplusAmount,
      goal: surplusGoal ? { id: surplusGoal.id, name: surplusGoal.name, linkedAccountIds: surplusGoal.linkedAccountIds } : null,
    },
    challenge: challenge ? { merchant: challenge.merchant, count: challenge.count, amount: challenge.amount, limitCount: challenge.limitCount, started: challenge.started } : null,
    challengeResults,
  };
}

/** 결산 달 말일까지 확인 안 한 정기 거래 수 — 홈 "확인할 일"과 같이 내가 고칠 수 있는 거래만 */
async function countPendingReviews(ctx: Ctx, before: DateStr): Promise<number> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      needsReview: true,
      date: { lt: toDbDate(before) },
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    select: { createdByUserId: true, visibility: true },
  });
  return rows.filter((t) => txAccess(t, ctx.userId, "us") === "full").length;
}
