import "server-only";
import {
  getAccountFlows,
  getAccounts,
  getLatestTransactions,
  getRecurringRules,
  getReviewTransactions,
  getScopedTransactions,
  type RecurringTemplate,
  type TxRow,
} from "@/features/ledger/queries";
import { getBalanceForecast } from "@/features/accounts/forecast";
import type { GoalView } from "@/features/goals/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { computeBalances } from "@/lib/finance/balance";
import { bigOutflowsBefore, pickTransferSource, roundUpToManwon } from "@/lib/finance/forecast";
import { upcomingCardDue } from "@/lib/finance/card-billing";
import { summarizePlanned, upcomingPlanned, type PlannedSummary } from "@/lib/finance/month-progress";
import { isBalanceStale, recentPayday, RECONCILE_BUNDLE_MIN } from "@/lib/finance/reconcile";
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
    linkedAccountIds: g.linkedAccountIds,
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
  opts: { today: DateStr; monthStartDay: number; goals: GoalView[] | SpendableGoal[]; month?: MonthKey },
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
      select: { id: true, type: true, amount: true, recurringRuleId: true, createdByUserId: true, visibility: true, date: true },
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
        toAccountId: t.toAccountId,
      })),
    txs: txs.filter(visible).map(({ id, type, amount, recurringRuleId, date }) => ({ id, type, amount, recurringRuleId, date: fromDbDate(date) })),
    goals: opts.goals.some((g) => "evaluation" in g) ? toSpendableGoals(opts.goals as GoalView[]) : (opts.goals as SpendableGoal[]),
    range,
    today: opts.today,
    // 나/배우자 뷰는 가구 공동 목표 저축을 차감하지 않는다
    includeGoals: scope === "us",
  };
}

/**
 * 오늘 뒤로 이번 달 안에 들어오거나 나갈 정기 수입·저축 (리포트 "예정").
 * 공개 범위는 쓸 수 있는 돈과 같이 템플릿 공개범위로 거른다.
 */
export async function getPlannedRest(
  ctx: Ctx,
  scope: ViewScope,
  opts: { today: DateStr; range: { start: DateStr; end: DateStr } },
): Promise<PlannedSummary> {
  const rules = await prisma.recurringRule.findMany({ where: { householdId: ctx.householdId, isActive: true } });
  const planned = rules
    .map((r) => ({ r, t: r.template as unknown as RecurringTemplate }))
    .filter(({ r, t }) => txAccess({ createdByUserId: r.createdByUserId, visibility: t.visibility }, ctx.userId, scope) !== "none")
    .map(({ r, t }) => ({
      name: r.name,
      type: t.type,
      amount: BigInt(t.amount),
      isActive: r.isActive,
      dayOfMonth: r.dayOfMonth,
      businessDayAdjust: r.businessDayAdjust,
      startDate: fromDbDate(r.startDate),
      endDate: r.endDate ? fromDbDate(r.endDate) : null,
      lastRunOn: r.lastRunOn ? fromDbDate(r.lastRunOn) : null,
    }));
  return summarizePlanned(upcomingPlanned(planned, opts.today, opts.range));
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
const REVIEW_LIMIT = 3;

export type ReviewItem =
  | { kind: "recurring"; key: string; date: DateStr; tx: TxRow }
  | {
      kind: "cardDue";
      key: string;
      /** 결제 예정일 */
      date: DateStr;
      /** toPay: 현재 미결제 사용액(양수) */
      card: { id: string; name: string; toPay: bigint };
      /** 출금 계좌 — 지정 안 했거나 내가 볼 수 없으면 null */
      payment: { id: string; name: string; balance: bigint } | null;
    }
  | {
      kind: "balance";
      key: string;
      date: DateStr | null;
      account: { id: string; name: string; type: AccountType; balance: bigint };
    }
  | {
      /** 통장 잔액 예보에서 2주 안에 0 아래로 내려가는 통장 */
      kind: "shortfall";
      key: string;
      /** 처음 모자라는 날 */
      date: DateStr;
      account: { id: string; name: string };
      /** 옮길 금액 (가장 낮을 때 기준, 만 원 단위 올림) */
      amount: bigint;
      /** 그때까지 크게 나가는 것 — "20일 생활비 카드 대금 272만" */
      causes: { date: DateStr; label: string; amount: bigint }[];
      /** 옮겨도 0 위에 남는 통장 */
      source: { id: string; name: string } | null;
    }
  | {
      /** 잔액 한 번에 맞추기 — 월급날 직후이거나 낡은 계좌가 여럿일 때 한 줄로 묶는다 */
      kind: "reconcile";
      key: string;
      date: DateStr | null;
      /** 잔액 입력이 오래된 평가액 계좌 수 */
      stale: number;
      /** 월급날 직후라 띄운 경우 그 월급일 */
      payday: DateStr | null;
    };

/**
 * 평가액 계좌 중 마지막 잔액 입력이 30일(1년에 한 번 고른 계좌는 365일) 넘은 것 — 오래된 순.
 * 부부는 서로의 계좌를 관리할 수 있으므로 내가 볼 수 있는 계좌 전부가 대상이다.
 */
export async function getStaleBalanceAccounts(ctx: Ctx, opts: { today: DateStr }) {
  const accounts = await getAccounts(ctx, "us");
  const valuation = accounts.filter((a) => VALUATION_TYPES.includes(a.type));
  if (!valuation.length) return [];
  const lastSnapshots = await prisma.accountSnapshot.groupBy({
    by: ["accountId"],
    where: { accountId: { in: valuation.map((a) => a.id) } },
    _max: { asOf: true },
  });
  const lastById = new Map(lastSnapshots.map((s) => [s.accountId, s._max.asOf ? fromDbDate(s._max.asOf) : null]));
  const stale = valuation
    .map((a) => ({ a, last: lastById.get(a.id) ?? null }))
    .filter(({ a, last }) => isBalanceStale(last, opts.today, a.balanceCheckYearly));
  if (!stale.length) return [];
  const ids = stale.map(({ a }) => a.id);
  const { snapshots, flows } = await getAccountFlows(ctx, ids, opts.today);
  const balances = computeBalances(ids, snapshots, flows, opts.today);
  return stale
    .map(({ a, last }) => ({ id: a.id, name: a.name, type: a.type, balance: balances.get(a.id) ?? 0n, last }))
    .sort((x, y) => (x.last ?? "").localeCompare(y.last ?? ""));
}

/** 결제 예정일 앞뒤로 이 기간 안에 카드로 들어온 이체가 있으면 이미 낸 것으로 본다 */
const CARD_PAID_LOOKBACK_DAYS = 10;

type CardDueItem = Extract<ReviewItem, { kind: "cardDue" }>;

/**
 * 결제일이 가까운 카드 (결제일 5일 전 ~ 2일 뒤). 결제일이 정해진 카드만,
 * 미결제 사용액이 있고 아직 대금 이체(→카드)를 기록하지 않은 경우만.
 */
export async function getCardDueItems(ctx: Ctx, opts: { today: DateStr }): Promise<CardDueItem[]> {
  const accounts = await getAccounts(ctx, "us");
  const due = accounts
    .filter((a) => a.type === "CREDIT_CARD" && a.billingDay !== null)
    .map((a) => ({ a, date: upcomingCardDue(opts.today, a.billingDay!) }))
    .filter((x): x is { a: (typeof accounts)[number]; date: DateStr } => x.date !== null);
  if (!due.length) return [];

  const visibleById = new Map(accounts.map((a) => [a.id, a]));
  const paymentIds = due.map(({ a }) => a.paymentAccountId).filter((id): id is string => !!id && visibleById.has(id));
  const ids = [...new Set([...due.map(({ a }) => a.id), ...paymentIds])];
  const earliest = due.reduce((min, { date }) => (date < min ? date : min), due[0]!.date);
  const [{ snapshots, flows }, paid] = await Promise.all([
    getAccountFlows(ctx, ids, opts.today),
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        toAccountId: { in: due.map(({ a }) => a.id) },
        date: { gte: toDbDate(addDays(earliest, -CARD_PAID_LOOKBACK_DAYS)) },
      },
      select: { toAccountId: true, date: true },
    }),
  ]);
  const balances = computeBalances(ids, snapshots, flows, opts.today);

  return due.flatMap(({ a, date }): CardDueItem[] => {
    const from = addDays(date, -CARD_PAID_LOOKBACK_DAYS);
    const alreadyPaid = paid.some((t) => t.toAccountId === a.id && fromDbDate(t.date) >= from);
    const toPay = -(balances.get(a.id) ?? 0n);
    if (alreadyPaid || toPay <= 0n) return [];
    const src = a.paymentAccountId ? visibleById.get(a.paymentAccountId) : undefined;
    return [
      {
        kind: "cardDue",
        key: `card:${a.id}:${date}`,
        date,
        card: { id: a.id, name: a.name, toPay },
        payment: src ? { id: src.id, name: src.name, balance: balances.get(src.id) ?? 0n } : null,
      },
    ];
  });
}

/**
 * 월급날 직후인데 그날 이후 아무 계좌도 잔액을 맞추지 않았으면 그 월급일.
 * 월급 = 진행 중인 수입(INCOME) 정기 규칙.
 */
async function getPaydayToReconcile(ctx: Ctx, today: DateStr): Promise<DateStr | null> {
  const rules = (await getRecurringRules(ctx)).filter((r) => r.isActive && r.template.type === "INCOME");
  const payday = recentPayday(rules, today);
  if (payday === null) return null;
  const last = await prisma.accountSnapshot.aggregate({
    where: { account: { householdId: ctx.householdId, isArchived: false } },
    _max: { asOf: true },
  });
  const lastAsOf = last._max.asOf ? fromDbDate(last._max.asOf) : null;
  return lastAsOf !== null && lastAsOf >= payday ? null : payday;
}

/**
 * 확인할 일 (PROD.MD §2-10): 결제일이 가까운 카드 + 정기 규칙이 만든 미확인 거래 + 평가액이 오래된 자산 계좌.
 * 카드 결제는 기한이 있으므로 맨 앞, 나머지는 오래된 순. 최대 3건.
 * 월급날 직후이거나 낡은 계좌가 2개 이상이면 계좌별 줄 대신 "잔액 한 번에 맞추기" 한 줄을 카드 다음에 둔다.
 */
export async function getReviewItems(ctx: Ctx, opts: { today: DateStr }): Promise<ReviewItem[]> {
  const [cards, pending, stale, payday, shortfalls] = await Promise.all([
    getCardDueItems(ctx, opts),
    getReviewTransactions(ctx, REVIEW_LIMIT),
    getStaleBalanceAccounts(ctx, opts),
    getPaydayToReconcile(ctx, opts.today),
    getShortfallItems(ctx, opts),
  ]);
  const bundle = payday !== null || stale.length >= RECONCILE_BUNDLE_MIN;
  const rest: ReviewItem[] = [
    ...pending.map((tx): ReviewItem => ({ kind: "recurring", key: `tx:${tx.id}`, date: tx.date, tx })),
    ...(bundle ? [] : stale.map(({ last, ...account }): ReviewItem => ({ kind: "balance", key: `acc:${account.id}`, date: last, account }))),
  ];
  // 스냅샷이 아예 없는 계좌는 가장 오래된 것으로 본다
  rest.sort((x, y) => (x.date ?? "").localeCompare(y.date ?? ""));
  const reconcile: ReviewItem[] = bundle
    ? [{ kind: "reconcile", key: "reconcile", date: payday ?? stale[0]?.last ?? null, stale: stale.length, payday }]
    : [];
  // 기한이 있는 것(카드 결제·잔액 부족)을 날짜순으로 맨 앞에
  const dated = [...cards, ...shortfalls].sort((x, y) => x.date.localeCompare(y.date));
  return [...dated, ...reconcile, ...rest].slice(0, REVIEW_LIMIT);
}

/** 잔액 부족은 이만큼 앞까지만 알린다 — 한 달 뒤 부족은 그 사이 월급·기록으로 바뀌기 쉽다 */
const SHORTFALL_NOTICE_DAYS = 14;

type ShortfallItem = Extract<ReviewItem, { kind: "shortfall" }>;

async function getShortfallItems(ctx: Ctx, opts: { today: DateStr }): Promise<ShortfallItem[]> {
  const forecasts = await getBalanceForecast(ctx, opts);
  const until = addDays(opts.today, SHORTFALL_NOTICE_DAYS);
  return forecasts.flatMap((f): ShortfallItem[] => {
    if (!f.shortfall || f.shortfall.date > until) return [];
    const amount = roundUpToManwon(f.shortfall.amount);
    const source = pickTransferSource(forecasts, f.id, amount);
    return [
      {
        kind: "shortfall",
        key: `short:${f.id}`,
        date: f.shortfall.date,
        account: { id: f.id, name: f.name },
        amount,
        causes: bigOutflowsBefore(f, f.shortfall.date).map((e) => ({ date: e.date, label: e.label, amount: -e.amount })),
        source: source ? { id: source.id, name: source.name } : null,
      },
    ];
  });
}

/** 최근 기록 — 오늘 기준 60일 안에서 최신 n건 */
export function getRecentTransactions(ctx: Ctx, scope: ViewScope, opts: { today: DateStr; limit: number }) {
  return getLatestTransactions(ctx, scope, { since: addDays(opts.today, -60), until: addDays(opts.today, 1), limit: opts.limit });
}

