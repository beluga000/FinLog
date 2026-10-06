import "server-only";
import { getCategories, getScopedTransactions } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { getMonthKey, getMonthRange, shiftMonth } from "@/lib/finance/period";
import { calculateMonthlyStats, type MonthlyStats } from "@/lib/finance/stats";
import type { MonthKey } from "@/lib/finance/types";
import type { ViewScope } from "@/lib/finance/visibility";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export interface MonthStats {
  month: MonthKey;
  stats: MonthlyStats;
}

/** endMonth 포함 이전 count 개월의 월 통계 (오래된 달 → 최근 달) */
export async function getMonthlySeries(
  ctx: Ctx,
  scope: ViewScope,
  opts: { endMonth: MonthKey; count: number; monthStartDay: number },
): Promise<MonthStats[]> {
  const first = shiftMonth(opts.endMonth, -(opts.count - 1));
  const range = {
    start: getMonthRange(first, opts.monthStartDay).start,
    end: getMonthRange(opts.endMonth, opts.monthStartDay).end,
  };
  const [{ items, summarized }, categories] = await Promise.all([
    getScopedTransactions(ctx, range, scope),
    getCategories(ctx),
  ]);
  const buckets = new Map<MonthKey, (typeof summarized)[number][]>();
  for (let i = 0; i < opts.count; i++) buckets.set(shiftMonth(first, i), []);
  for (const tx of [...items, ...summarized]) {
    buckets.get(getMonthKey(tx.date, opts.monthStartDay))?.push(tx);
  }
  return [...buckets.entries()].map(([month, txs]) => ({ month, stats: calculateMonthlyStats(txs, categories) }));
}

/**
 * 월 저축 가능액 = 직전 3개월(이번 달 제외) 평균 저축액(SAVE_INVEST + LOAN_REPAY).
 * 기록이 있는 달만 평균한다 — 가입 직후 빈 달 때문에 0으로 떨어지지 않게.
 */
export async function getSavingCapacity(ctx: Ctx, opts: { today: string; monthStartDay: number }) {
  const current = getMonthKey(opts.today, opts.monthStartDay);
  const series = await getMonthlySeries(ctx, "us", {
    endMonth: shiftMonth(current, -1),
    count: 3,
    monthStartDay: opts.monthStartDay,
  });
  const active = series.filter((s) => s.stats.income > 0n || s.stats.expense > 0n || s.stats.saving > 0n);
  if (!active.length) return { capacity: 0, avgSaving: 0, avgSurplus: 0, basisMonths: 0 };
  const avg = (f: (s: MonthlyStats) => bigint) => active.reduce((sum, s) => sum + Number(f(s.stats)), 0) / active.length;
  const avgSaving = Math.round(avg((s) => s.saving));
  const avgSurplus = Math.round(avg((s) => s.remaining));
  return { capacity: Math.max(0, avgSaving), avgSaving, avgSurplus, basisMonths: active.length };
}
