import "server-only";
import {
  getAccountFlows,
  getAccounts,
  getReviewTransactions,
  getScopedTransactions,
  type RecurringTemplate,
  type TxRow,
} from "@/features/ledger/queries";
import type { GoalView } from "@/features/goals/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { computeBalances } from "@/lib/finance/balance";
import { addDays, getMonthKey, getMonthRange } from "@/lib/finance/period";
import {
  calculateSpendable,
  daysLeftInRange,
  summarizeSpendableInputs,
  type Spendable,
  type SpendableGoal,
  type SpendableRule,
  type SpendableTx,
} from "@/lib/finance/spendable";
import type { AccountType, DateStr, MonthKey } from "@/lib/finance/types";
import { txAccess, type ViewScope } from "@/lib/finance/visibility";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

/** 목표 → 쓸 수 있는 돈의 목표 저축 (monthlyCommit ?? 필요 납입액) */
export function toSpendableGoals(goals: GoalView[]): SpendableGoal[] {
  return goals.map((g) => ({
    status: g.status,
    monthly: BigInt(Math.round(g.monthlyCommit ?? g.evaluation.required.monthly)),
  }));
}

export interface SpendableSource {
  rules: SpendableRule[];
  txs: (SpendableTx & { id: string })[];
  goals: SpendableGoal[];
  range: { start: DateStr; end: DateStr };
  today: DateStr;
  includeGoals: boolean;
}

/**
 * 쓸 수 있는 돈 계산 재료 (PROD.MD §2-7). 금액 합계에만 쓰므로 SUMMARY_ONLY 도 포함하고 PRIVATE 만 뺀다.
 * 정기 규칙도 템플릿 공개범위로 같은 규칙을 적용한다.
 */
export async function getSpendableSource(
  ctx: Ctx,
  scope: ViewScope,
  opts: { today: DateStr; monthStartDay: number; goals: GoalView[]; month?: MonthKey },
): Promise<SpendableSource> {
  const range = getMonthRange(opts.month ?? getMonthKey(opts.today, opts.monthStartDay), opts.monthStartDay);
  const [rules, txs] = await Promise.all([
    prisma.recurringRule.findMany({ where: { householdId: ctx.householdId } }),
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        type: { in: ["INCOME", "EXPENSE"] },
        date: { gte: toDbDate(range.start), lt: toDbDate(range.end) },
        OR: [{ createdByUserId: ctx.userId }, { visibility: { not: "PRIVATE" } }],
      },
      select: { id: true, type: true, amount: true, recurringRuleId: true, createdByUserId: true, visibility: true },
    }),
  ]);
  const visible = (x: Parameters<typeof txAccess>[0]) => txAccess(x, ctx.userId, scope) !== "none";
  return {
    rules: rules
      .map((r) => ({ r, t: r.template as unknown as RecurringTemplate }))
      .filter(({ r, t }) => visible({ createdByUserId: r.createdByUserId, visibility: t.visibility }))
      .map(({ r, t }) => ({
        id: r.id,
        type: t.type,
        amount: BigInt(t.amount),
        isActive: r.isActive,
        startDate: fromDbDate(r.startDate),
        endDate: r.endDate ? fromDbDate(r.endDate) : null,
      })),
    txs: txs.filter(visible).map(({ id, type, amount, recurringRuleId }) => ({ id, type, amount, recurringRuleId })),
    goals: toSpendableGoals(opts.goals),
    range,
    today: opts.today,
    // 나/배우자 뷰는 가구 공동 목표 저축을 차감하지 않는다
    includeGoals: scope === "us",
  };
}

export function computeSpendable(source: SpendableSource, opts: { excludeTxId?: string } = {}): Spendable {
  const txs = opts.excludeTxId ? source.txs.filter((t) => t.id !== opts.excludeTxId) : source.txs;
  const inputs = summarizeSpendableInputs({ ...source, txs });
  return calculateSpendable({ ...inputs, daysLeft: daysLeftInRange(source.today, source.range) });
}

/** 이번 달 실제 저축 (SAVE_INVEST + LOAN_REPAY) — 공개 범위 적용 합계 */
export async function getMonthSaving(ctx: Ctx, scope: ViewScope, range: { start: DateStr; end: DateStr }) {
  const { items, summarized } = await getScopedTransactions(ctx, range, scope);
  return [...items, ...summarized]
    .filter((t) => t.type === "SAVE_INVEST" || t.type === "LOAN_REPAY")
    .reduce((s, t) => s + t.amount, 0n);
}

/** 거래 흐름만으로는 평가액 변동을 알 수 없는 계좌 — 잔액 업데이트 대상 */
const VALUATION_TYPES: AccountType[] = ["INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET"];
export const STALE_BALANCE_DAYS = 30;
const REVIEW_LIMIT = 3;

export type ReviewItem =
  | { kind: "recurring"; key: string; date: DateStr; tx: TxRow }
  | {
      kind: "balance";
      key: string;
      date: DateStr | null;
      account: { id: string; name: string; type: AccountType; balance: bigint };
    };

/**
 * 확인할 일 (PROD.MD §2-10): 정기 규칙이 만든 미확인 거래 + 평가액이 30일 넘게 갱신 안 된 자산 계좌.
 * 오래된 순 최대 3건. 내가 편집할 수 있는 것(내 것·공유·공동 명의)만.
 */
/** 평가액 계좌 중 마지막 잔액 입력이 30일 넘은 것 (내 것·공동 명의만) — 오래된 순 */
export async function getStaleBalanceAccounts(ctx: Ctx, opts: { today: DateStr }) {
  const accounts = await getAccounts(ctx, "us");
  const valuation = accounts.filter(
    (a) => VALUATION_TYPES.includes(a.type) && (a.ownerUserId === ctx.userId || a.ownerUserId === null),
  );
  if (!valuation.length) return [];
  const lastSnapshots = await prisma.accountSnapshot.groupBy({
    by: ["accountId"],
    where: { accountId: { in: valuation.map((a) => a.id) } },
    _max: { asOf: true },
  });
  const lastById = new Map(lastSnapshots.map((s) => [s.accountId, s._max.asOf ? fromDbDate(s._max.asOf) : null]));
  const staleBefore = addDays(opts.today, -STALE_BALANCE_DAYS);
  const stale = valuation
    .map((a) => ({ a, last: lastById.get(a.id) ?? null }))
    .filter(({ last }) => last === null || last < staleBefore);
  if (!stale.length) return [];
  const ids = stale.map(({ a }) => a.id);
  const { snapshots, flows } = await getAccountFlows(ctx, ids, opts.today);
  const balances = computeBalances(ids, snapshots, flows, opts.today);
  return stale
    .map(({ a, last }) => ({ id: a.id, name: a.name, type: a.type, balance: balances.get(a.id) ?? 0n, last }))
    .sort((x, y) => (x.last ?? "").localeCompare(y.last ?? ""));
}

export async function getReviewItems(ctx: Ctx, opts: { today: DateStr }): Promise<ReviewItem[]> {
  const [pending, stale] = await Promise.all([getReviewTransactions(ctx, REVIEW_LIMIT), getStaleBalanceAccounts(ctx, opts)]);
  const items: ReviewItem[] = [
    ...pending.map((tx): ReviewItem => ({ kind: "recurring", key: `tx:${tx.id}`, date: tx.date, tx })),
    ...stale.map(({ last, ...account }): ReviewItem => ({ kind: "balance", key: `acc:${account.id}`, date: last, account })),
  ];
  // 스냅샷이 아예 없는 계좌는 가장 오래된 것으로 본다
  return items.sort((x, y) => (x.date ?? "").localeCompare(y.date ?? "")).slice(0, REVIEW_LIMIT);
}

/** 최근 기록 — 오늘 기준 60일 안에서 최신 n건 */
export async function getRecentTransactions(ctx: Ctx, scope: ViewScope, opts: { today: DateStr; limit: number }) {
  const { items } = await getScopedTransactions(ctx, { start: addDays(opts.today, -60), end: addDays(opts.today, 1) }, scope);
  return items.slice(0, opts.limit);
}

