import type { CategoryAmount } from "./stats";

/**
 * 평소와 다른 지출 (PROD.MD Phase 3 "이상 지출 감지") — 이 달 대분류별 지출을 직전 몇 달 평균과 비교한다.
 * 진행 중인 달도 쓴다: 지출은 달이 갈수록 늘기만 하므로, 벌써 평균을 넘었다면 이미 많이 쓴 것이다.
 * 기준: 평균보다 40% 이상 많고 그 차이가 5만 원 이상. 평소엔 없던 카테고리는 10만 원 이상이면 알린다.
 */

export const UNUSUAL_MIN_RATE = 0.4;
export const UNUSUAL_MIN_DIFF = 50_000n;
export const UNUSUAL_NEW_MIN = 100_000n;
/** 비교할 직전 달 수 · 그중 기록이 있어야 하는 달 수 */
export const UNUSUAL_BASE_MONTHS = 3;
export const UNUSUAL_MIN_BASE_MONTHS = 2;
export const UNUSUAL_MAX_ITEMS = 3;

export interface UnusualItem {
  categoryId: string | null;
  name: string;
  amount: bigint;
  /** 직전 달 평균 (기록 있는 달만) */
  average: bigint;
  diff: bigint;
  /** 평균 대비 증가율. 평소 없던 지출이면 null */
  rate: number | null;
}

export function detectUnusualSpending(
  current: CategoryAmount[],
  /** 직전 달들의 대분류별 지출 (오래된 달 → 최근 달). 지출이 0인 달은 평균에서 뺀다 */
  history: { expense: bigint; byCategory: CategoryAmount[] }[],
): UnusualItem[] {
  const base = history.slice(-UNUSUAL_BASE_MONTHS).filter((h) => h.expense > 0n);
  if (base.length < UNUSUAL_MIN_BASE_MONTHS) return [];
  const n = BigInt(base.length);
  const sums = new Map<string | null, bigint>();
  for (const h of base) for (const c of h.byCategory) sums.set(c.categoryId, (sums.get(c.categoryId) ?? 0n) + c.amount);

  const out: UnusualItem[] = [];
  for (const c of current) {
    const average = (sums.get(c.categoryId) ?? 0n) / n;
    const diff = c.amount - average;
    if (average === 0n) {
      if (c.amount >= UNUSUAL_NEW_MIN) out.push({ categoryId: c.categoryId, name: c.name, amount: c.amount, average, diff, rate: null });
      continue;
    }
    const rate = Number(diff) / Number(average);
    if (diff >= UNUSUAL_MIN_DIFF && rate >= UNUSUAL_MIN_RATE) out.push({ categoryId: c.categoryId, name: c.name, amount: c.amount, average, diff, rate });
  }
  return out.sort((a, b) => (b.diff > a.diff ? 1 : b.diff < a.diff ? -1 : 0)).slice(0, UNUSUAL_MAX_ITEMS);
}
