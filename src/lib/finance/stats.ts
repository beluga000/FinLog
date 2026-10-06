import { ratio, sumBigInt } from "./money";
import type { BudgetBucket, CategoryNode, TxType } from "./types";

/**
 * 월 통계 (PROD.MD §2-2, §2-8).
 * - 수입 = INCOME, 지출 = EXPENSE
 * - TRANSFER / ADJUSTMENT 는 수입·지출·저축 어디에도 넣지 않는다 (카드대금 결제 이중 집계 방지)
 * - 저축 = SAVE_INVEST + LOAN_REPAY(원금 상환)
 * - 저축률 = 저축 / 수입
 */

export interface StatTx {
  type: TxType;
  amount: bigint;
  categoryId: string | null;
  isFixed: boolean;
}

export interface CategoryAmount {
  categoryId: string | null;
  name: string;
  amount: bigint;
  /** 지출 합계 대비 비중 */
  share: number | null;
}

export interface MonthlyStats {
  income: bigint;
  expense: bigint;
  saving: bigint;
  /** 수입 − 지출 − 저축 (남은 돈 / 음수면 적자) */
  remaining: bigint;
  savingsRate: number | null;
  fixedExpense: bigint;
  variableExpense: bigint;
  buckets: Record<BudgetBucket | "UNCLASSIFIED", bigint>;
  /** 수입 대비 버킷 비율 (50/30/20 비교용) */
  bucketRatios: Record<BudgetBucket, number | null>;
  expenseByTopCategory: CategoryAmount[];
  incomeByTopCategory: CategoryAmount[];
}

export const UNCATEGORIZED = "미분류";

export function buildCategoryIndex(categories: CategoryNode[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const top = (id: string | null): CategoryNode | null => {
    let node = id ? byId.get(id) ?? null : null;
    while (node?.parentId) node = byId.get(node.parentId) ?? node;
    return node;
  };
  /** 자식에 버킷이 없으면 부모 버킷을 상속 */
  const bucketOf = (id: string | null): BudgetBucket | null => {
    let node = id ? byId.get(id) ?? null : null;
    while (node) {
      if (node.bucket) return node.bucket;
      node = node.parentId ? byId.get(node.parentId) ?? null : null;
    }
    return null;
  };
  return { byId, top, bucketOf };
}

function groupByTop(
  txs: StatTx[],
  index: ReturnType<typeof buildCategoryIndex>,
): CategoryAmount[] {
  const totals = new Map<string | null, { name: string; amount: bigint }>();
  for (const tx of txs) {
    const top = index.top(tx.categoryId);
    const key = top?.id ?? null;
    const prev = totals.get(key) ?? { name: top?.name ?? UNCATEGORIZED, amount: 0n };
    prev.amount += tx.amount;
    totals.set(key, prev);
  }
  const total = sumBigInt([...totals.values()].map((v) => v.amount));
  return [...totals.entries()]
    .map(([categoryId, v]) => ({ categoryId, name: v.name, amount: v.amount, share: ratio(v.amount, total) }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

export function calculateMonthlyStats(txs: StatTx[], categories: CategoryNode[]): MonthlyStats {
  const index = buildCategoryIndex(categories);
  const incomes = txs.filter((t) => t.type === "INCOME");
  const expenses = txs.filter((t) => t.type === "EXPENSE");
  const savings = txs.filter((t) => t.type === "SAVE_INVEST" || t.type === "LOAN_REPAY");

  const income = sumBigInt(incomes.map((t) => t.amount));
  const expense = sumBigInt(expenses.map((t) => t.amount));
  const saving = sumBigInt(savings.map((t) => t.amount));
  const fixedExpense = sumBigInt(expenses.filter((t) => t.isFixed).map((t) => t.amount));

  const buckets: MonthlyStats["buckets"] = { NEEDS: 0n, WANTS: 0n, SAVINGS: saving, UNCLASSIFIED: 0n };
  for (const tx of expenses) {
    const bucket = index.bucketOf(tx.categoryId);
    if (bucket === "NEEDS" || bucket === "WANTS") buckets[bucket] += tx.amount;
    else buckets.UNCLASSIFIED += tx.amount;
  }

  return {
    income,
    expense,
    saving,
    remaining: income - expense - saving,
    savingsRate: ratio(saving, income),
    fixedExpense,
    variableExpense: expense - fixedExpense,
    buckets,
    bucketRatios: {
      NEEDS: ratio(buckets.NEEDS, income),
      WANTS: ratio(buckets.WANTS + buckets.UNCLASSIFIED, income),
      SAVINGS: ratio(buckets.SAVINGS, income),
    },
    expenseByTopCategory: groupByTop(expenses, index),
    incomeByTopCategory: groupByTop(incomes, index),
  };
}

export interface Delta {
  current: bigint;
  previous: bigint;
  diff: bigint;
  /** 전월 0이면 null */
  rate: number | null;
}

export function delta(current: bigint, previous: bigint): Delta {
  return { current, previous, diff: current - previous, rate: ratio(current - previous, previous) };
}

export function compareMonths(cur: MonthlyStats, prev: MonthlyStats) {
  const prevByCat = new Map(prev.expenseByTopCategory.map((c) => [c.categoryId, c.amount]));
  return {
    income: delta(cur.income, prev.income),
    expense: delta(cur.expense, prev.expense),
    saving: delta(cur.saving, prev.saving),
    topExpenses: cur.expenseByTopCategory.slice(0, 5).map((c) => ({
      ...c,
      delta: delta(c.amount, prevByCat.get(c.categoryId) ?? 0n),
    })),
  };
}
