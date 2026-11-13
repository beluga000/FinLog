import "server-only";
import { getAccountOverview } from "@/features/accounts/queries";
import { getSavingCapacity } from "@/features/dashboard/queries";
import { getAccountFlows, getAccounts, type RecurringTemplate } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { balanceSeries, summarizeNetWorth } from "@/lib/finance/balance";
import {
  allocateByPriority,
  claimsByAccount,
  evaluateGoal,
  expectedProgress,
  goalBlocker,
  goalCurrent,
  goalPlanPath,
  isFastTrack,
  newMilestone,
  simulatePriorityRaise,
  type GoalBlocker,
  type GoalClaim,
  type GoalEvaluation,
} from "@/lib/finance/goals";
import { calculateRequiredInvestment } from "@/lib/finance/projection";
import { addMonthsExact, getMonthKey, monthsBetween, shiftMonth, todayKST } from "@/lib/finance/period";
import type { SpendableGoal } from "@/lib/finance/spendable";
import type { MoveTarget } from "./components/move-to-goal";
import type { DateStr, MonthKey } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export const DEFAULT_INFLATION = 0.025;
/** 대안 (c): 기대수익률 +2%p 가정 (상한 9%) */
const higherReturnOf = (r: number) => Math.min(0.09, r + 0.02);

export interface GoalView {
  id: string;
  name: string;
  targetAmount: number;
  targetIsReal: boolean;
  targetDate: DateStr;
  priority: number;
  expectedReturn: number;
  linkedAccountIds: string[];
  linkedAccountNames: string[];
  monthlyCommit: number | null;
  status: "ACTIVE" | "ACHIEVED" | "PAUSED";
  current: number;
  /** 기준일에 이 목표 몫으로 넣은 돈 */
  startAmount: number;
  /** 기준 잔액 */
  baseBalance: number;
  /** 기준일 뒤로 늘어난(음수면 줄어든) 돈 — 기준 잔액의 변화 */
  growth: number;
  /** 기준일 (없으면 null) */
  baseSetOn: DateStr | null;
  /** 예전 방식 — 시작 금액·기준 잔액 없이 잔액 전체를 모인 돈으로 센다 */
  legacy: boolean;
  createdOn: DateStr;
  /** 홈에 띄울 새 진행률 단계 (25·50·75·100) — 없으면 null */
  milestone: number | null;
  /** 계획상 지금 있어야 할 진척률 (expectedProgress) — 목표 막대의 눈금. 진행 중이 아니거나 예전 방식 목표면 null */
  expected: number | null;
  /** 연결 계좌가 없어 순자산을 기준으로 삼았는지 */
  usesNetWorth: boolean;
  /** 배분된 월 납입액 (확정값 또는 우선순위 배분) */
  contribution: number;
  contributionSource: "commit" | "allocated";
  shortfall: number;
  /** 곧 끝나는 목표라 우선순위보다 먼저 배분받는지 (isFastTrack) */
  fastTrack: boolean;
  /** 배정액이 0원인 원인 — 없으면 null */
  blockedBy: GoalBlocker | null;
  /** 지금 배정액을 유지하면 달성하는 달 — 못 닿거나 이미 달성 가능하면 null */
  etaMonth: MonthKey | null;
  /**
   * 대안 (d) — 자동 배분 목표가 우선순위에 밀려 부족할 때, 한 칸 올리면 어떻게 되는지.
   * displaced.committed = 확정액 목표라 납입액은 그대로지만 확정액보다 모자라게 된다.
   */
  priorityRaise: {
    allocated: number;
    gain: number;
    shortfall: number;
    displaced: { id: string; name: string; loss: number; committed: boolean }[];
  } | null;
  evaluation: GoalEvaluation;
}

/** 목표별 지금 모인 돈·필요 납입액 — 목표 화면과 "쓸 수 있는 돈" 이 같이 쓰는 바탕 */
async function goalBases(ctx: Ctx, opts: { today: DateStr; monthStartDay: number }) {
  const [goals, overview] = await Promise.all([
    prisma.assetGoal.findMany({ where: { householdId: ctx.householdId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    getAccountOverview(ctx, "us", { today: opts.today, monthStartDay: opts.monthStartDay, trendMonths: 1 }),
  ]);
  const balanceById = new Map(overview.accounts.map((a) => [a.id, a]));
  const netWorth = Number(overview.netWorth.netWorth);

  const base = goals.map((g) => {
    const linked = g.linkedAccountIds.map((id) => balanceById.get(id)).filter((a) => !!a);
    const usesNetWorth = linked.length === 0;
    const basis = usesNetWorth ? netWorth : linked.reduce((s, a) => s + Number(a.balance), 0);
    const startAmount = Number(g.startAmount);
    const baseBalance = Number(g.baseBalance);
    const current = goalCurrent({ startAmount, baseBalance }, basis);
    const targetDate = fromDbDate(g.targetDate);
    const expectedReturn = Number(g.expectedReturn);
    const target = Number(g.targetAmount);
    const required = calculateRequiredInvestment({
      target,
      pv: current,
      months: monthsBetween(opts.today, targetDate),
      annualReturn: expectedReturn,
      targetIsReal: g.targetIsReal,
      inflation: DEFAULT_INFLATION,
    });
    const commit = g.monthlyCommit === null ? null : Number(g.monthlyCommit);
    return {
      g,
      linked,
      usesNetWorth,
      current,
      startAmount,
      baseBalance,
      growth: basis - baseBalance,
      targetDate,
      expectedReturn,
      target,
      commit,
      required,
      demand: g.status === "ACTIVE" ? commit ?? required.monthly : 0,
    };
  });
  return { base, overview, netWorth };
}

/**
 * "쓸 수 있는 돈" 계산용 목표 저축만 — toSpendableGoals(getGoalsOverview().goals) 와 같은 값.
 * 거래 저장 직후처럼 저축 여력·배분·평가가 필요 없을 때 가볍게 쓴다.
 */
export async function getSpendableGoals(ctx: Ctx, opts: { today: DateStr; monthStartDay: number }): Promise<SpendableGoal[]> {
  const { base } = await goalBases(ctx, opts);
  return base.map((b) => ({
    status: b.g.status,
    monthly: BigInt(Math.round(b.commit ?? b.required.monthly)),
    linkedAccountIds: b.linked.map((a) => a.id),
  }));
}

export async function getGoalsOverview(ctx: Ctx, opts: { today: DateStr; monthStartDay: number }) {
  const [{ base, overview, netWorth }, capacity] = await Promise.all([goalBases(ctx, opts), getSavingCapacity(ctx, opts)]);

  const fastTrack = new Set(
    base.filter((b) => b.demand > 0 && isFastTrack(b.target - b.current, capacity.capacity)).map((b) => b.g.id),
  );
  const allocation = allocateByPriority(
    base.map((b) => ({ id: b.g.id, priority: b.g.priority, demand: b.demand, fastTrack: fastTrack.has(b.g.id) })),
    capacity.capacity,
  );

  const ordered = base.map((b) => ({
    id: b.g.id,
    demand: b.demand,
    active: b.g.status === "ACTIVE",
    fastTrack: fastTrack.has(b.g.id),
  }));
  const byId = new Map(base.map((b) => [b.g.id, b]));

  const views: GoalView[] = base.map((b) => {
    const alloc = allocation.get(b.g.id) ?? { allocated: 0, shortfall: 0 };
    const contribution = b.commit ?? alloc.allocated;
    // 확정액 목표는 배분과 무관하게 확정액을 납입하므로 올려도 납입액이 같다
    const raise =
      b.commit === null && b.g.status === "ACTIVE" && alloc.shortfall > 0
        ? simulatePriorityRaise(ordered, capacity.capacity, b.g.id)
        : null;
    const evaluation = evaluateGoal({
      target: b.target,
      targetIsReal: b.g.targetIsReal,
      targetDate: b.targetDate,
      expectedReturn: b.expectedReturn,
      current: b.current,
      monthlyContribution: contribution,
      today: opts.today,
      inflation: DEFAULT_INFLATION,
      higherReturn: higherReturnOf(b.expectedReturn),
    });
    return {
      id: b.g.id,
      name: b.g.name,
      targetAmount: b.target,
      targetIsReal: b.g.targetIsReal,
      targetDate: b.targetDate,
      priority: b.g.priority,
      expectedReturn: b.expectedReturn,
      linkedAccountIds: b.linked.map((a) => a.id),
      linkedAccountNames: b.linked.map((a) => a.name),
      monthlyCommit: b.commit,
      status: b.g.status,
      current: b.current,
      startAmount: b.startAmount,
      baseBalance: b.baseBalance,
      growth: b.growth,
      baseSetOn: b.g.baseSetOn ? fromDbDate(b.g.baseSetOn) : null,
      legacy: b.g.baseSetOn === null && b.startAmount === 0 && b.baseBalance === 0,
      createdOn: todayKST(b.g.createdAt),
      milestone: b.g.status === "ACTIVE" ? newMilestone(b.target > 0 ? b.current / b.target : 0, b.g.milestoneSeen) : null,
      // 예전 방식 목표(legacy)는 시작 시점의 모은 돈을 몰라 눈금을 그리지 않는다
      expected:
        b.g.status === "ACTIVE" && !(b.g.baseSetOn === null && b.startAmount === 0 && b.baseBalance === 0)
          ? expectedProgress({
              start: b.g.baseSetOn ? fromDbDate(b.g.baseSetOn) : todayKST(b.g.createdAt),
              startAmount: b.startAmount,
              target: b.target,
              targetDate: b.targetDate,
              today: opts.today,
            })
          : null,
      usesNetWorth: b.usesNetWorth,
      contribution,
      contributionSource: b.commit !== null ? "commit" : "allocated",
      shortfall: alloc.shortfall,
      fastTrack: fastTrack.has(b.g.id),
      blockedBy: goalBlocker({
        status: b.g.status,
        contribution,
        committed: b.commit !== null,
        capacity: capacity.capacity,
        alreadyAchievable: evaluation.required.alreadyAchievable,
      }),
      etaMonth:
        evaluation.projectedMonths !== null && !evaluation.required.alreadyAchievable
          ? shiftMonth(getMonthKey(opts.today, 1), evaluation.projectedMonths)
          : null,
      priorityRaise: raise && {
        ...raise,
        displaced: raise.displaced.map((d) => {
          const o = byId.get(d.id)!;
          return { id: d.id, name: o.g.name, loss: d.loss, committed: o.commit !== null };
        }),
      },
      evaluation,
    };
  });

  const totalDemand = base.reduce((s, b) => s + b.demand, 0);
  // 목표 입력 창에서 "지금 모인 돈" 을 바로 보여 주려고 잔액도 넘긴다
  const accounts = overview.accounts.map(({ id, name, type, balance }) => ({ id, name, type, balance: Number(balance) }));
  // 목표 입력 창에서 "다른 목표가 이 계좌에서 쓰는 돈"을 보여 주려고
  const claims: GoalClaims = {
    byAccount: Object.fromEntries(claimsByAccount(views, new Map(accounts.map((a) => [a.id, a.balance])))),
    all: views.filter((v) => v.current > 0).map((v) => ({ goalId: v.id, name: v.name, amount: v.current })),
  };
  return { goals: views, capacity, totalDemand, accounts, netWorth, claims };
}

/** 다른 목표 몫 — 계좌별(byAccount), 전체(all: 순자산 기준 목표용) */
export interface GoalClaims {
  byAccount: Record<string, GoalClaim[]>;
  all: GoalClaim[];
}

/* ───────── 기준 잔액 ───────── */

type Basis = (linkedIds: string[]) => number;

/**
 * 보이는 계좌의 날짜별 기준 잔액 — getGoalsOverview 와 같은 기준(보관 계좌 제외).
 * dates 순서대로 "연결 계좌(보이는 것) 합계, 없으면 순자산" 계산기를 돌려준다. 거래는 한 번만 훑는다.
 * fresh: 서버 액션에서 변경 전후를 읽을 때 요청 캐시를 건너뛴다.
 */
async function balanceBook(ctx: Ctx, dates: DateStr[], opts: { fresh?: boolean } = {}): Promise<Basis[]> {
  const accounts = await getAccounts(ctx, "us", { fresh: opts.fresh });
  const ids = accounts.map((a) => a.id);
  const visible = new Set(ids);
  const until = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
  const { snapshots, flows } = await getAccountFlows(ctx, ids, until, { fresh: opts.fresh });
  return balanceSeries(ids, snapshots, flows, dates).map((balances) => {
    const netWorth = Number(summarizeNetWorth(accounts, balances).netWorth);
    return (linkedIds: string[]) => {
      const linked = linkedIds.filter((id) => visible.has(id));
      return linked.length ? linked.reduce((s, id) => s + Number(balances.get(id) ?? 0n), 0) : netWorth;
    };
  });
}

async function basisToday(ctx: Ctx, opts: { fresh?: boolean } = {}) {
  return (await balanceBook(ctx, [todayKST()], opts))[0];
}

const currentOf = (g: { startAmount: bigint; baseBalance: bigint }, basis: number) =>
  goalCurrent({ startAmount: Number(g.startAmount), baseBalance: Number(g.baseBalance) }, basis);

/** 목표 저장 시 기준 잔액 (오늘) */
export async function getGoalBasis(ctx: Ctx, linkedIds: string[]) {
  return (await basisToday(ctx))(linkedIds);
}

/** 이 계좌에 연결된 목표와 지금 모인 돈 — 계좌 보관·삭제 확인 창 안내용 */
export async function linkedGoalsOf(ctx: Ctx, accountId: string) {
  const goals = await prisma.assetGoal.findMany({
    where: { householdId: ctx.householdId, linkedAccountIds: { has: accountId } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!goals.length) return [];
  const basis = await basisToday(ctx);
  return goals.map((g) => ({ id: g.id, name: g.name, current: currentOf(g, basis(g.linkedAccountIds)) }));
}

/**
 * 계좌 보관·복원처럼 기준 잔액이 바뀌는 변경을 감싼다 — 변경 직전 모인 돈을 시작 금액으로 다시 잡아
 * 계좌가 계산에서 빠지거나 돌아와도 목표 금액이 튀지 않게 한다.
 */
export async function keepGoalsSteady(ctx: Ctx, accountId: string, change: () => Promise<void>) {
  const goals = await prisma.assetGoal.findMany({ where: { householdId: ctx.householdId, linkedAccountIds: { has: accountId } } });
  if (!goals.length) return change();
  // 변경 전후를 모두 DB 에서 새로 읽는다 (요청 캐시에 변경 전 값이 남지 않게)
  const before = await basisToday(ctx, { fresh: true });
  const currents = goals.map((g) => currentOf(g, before(g.linkedAccountIds)));
  await change();
  const after = await basisToday(ctx, { fresh: true });
  const today = toDbDate(todayKST());
  await prisma.$transaction(
    goals.map((g, i) =>
      prisma.assetGoal.update({
        where: { id: g.id },
        data: {
          startAmount: BigInt(Math.round(currents[i])),
          baseBalance: BigInt(Math.round(after(g.linkedAccountIds))),
          baseSetOn: today,
        },
      }),
    ),
  );
}

export interface GoalShift {
  id: string;
  name: string;
  before: number;
  after: number;
  target: number;
}

/**
 * 잔액 맞추기처럼 모인 돈이 바뀌는 변경을 감싸 진행 중 목표마다 전후 모인 돈을 돌려준다 (바뀐 것만).
 * 연결 계좌가 없는 목표는 순자산을 기준으로 하므로 어느 계좌를 고쳐도 바뀔 수 있다.
 */
export async function goalShiftsAround(ctx: Ctx, change: () => Promise<unknown>): Promise<GoalShift[]> {
  const goals = await prisma.assetGoal.findMany({
    where: { householdId: ctx.householdId, status: "ACTIVE" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!goals.length) {
    await change();
    return [];
  }
  const before = await basisToday(ctx, { fresh: true });
  const currents = goals.map((g) => currentOf(g, before(g.linkedAccountIds)));
  await change();
  const after = await basisToday(ctx, { fresh: true });
  return goals
    .map((g, i) => ({
      id: g.id,
      name: g.name,
      before: Math.round(currents[i]),
      after: Math.round(currentOf(g, after(g.linkedAccountIds))),
      target: Number(g.targetAmount),
    }))
    .filter((s) => s.before !== s.after);
}

/* ───────── 계획 대비 실제 (그래프) ───────── */

export interface GoalHistoryPoint {
  date: DateStr;
  actual: number;
  plan: number;
}

/**
 * 기준일(없으면 만든 날)부터 한 달 간격으로 모인 돈과 계획선. 오늘이 마지막 점.
 * 계획선은 기준일에 모인 돈에서 출발해 목표일에 목표 금액에 닿는 경로다.
 */
export async function getGoalHistory(
  ctx: Ctx,
  goal: Pick<
    GoalView,
    "linkedAccountIds" | "startAmount" | "baseBalance" | "baseSetOn" | "createdOn" | "targetAmount" | "targetDate" | "targetIsReal" | "expectedReturn"
  >,
  today: DateStr,
): Promise<GoalHistoryPoint[]> {
  const from = goal.baseSetOn ?? goal.createdOn;
  if (from >= today) return [];
  // 한 달 간격 날짜(최대 120개월) + 오늘 — 잔액은 한 번에 계산한다
  const n = Math.min(monthsBetween(from, today), 120);
  const dates: DateStr[] = [];
  for (let i = 0; i <= n; i++) {
    const date = addMonthsExact(from, i);
    if (date > today) break;
    dates.push(date);
  }
  const monthly = dates.length;
  if (dates[monthly - 1] < today) dates.push(today);
  const actual = (await balanceBook(ctx, dates)).map((basis) =>
    goalCurrent({ startAmount: goal.startAmount, baseBalance: goal.baseBalance }, basis(goal.linkedAccountIds)),
  );

  const plan = goalPlanPath({
    start: actual[0],
    months: monthsBetween(from, goal.targetDate),
    target: goal.targetAmount,
    targetIsReal: goal.targetIsReal,
    expectedReturn: goal.expectedReturn,
    inflation: DEFAULT_INFLATION,
  });
  return dates.map((date, i) => {
    // 오늘 점은 마지막 달 점에서 지난 날만큼 계획선을 더 간다
    const m = i < monthly ? i : monthly - 1 + (Date.parse(today) - Date.parse(dates[monthly - 1])) / (30.44 * 864e5);
    return { date, actual: actual[i], plan: plan(m) };
  });
}

/* ───────── 남은 돈 옮기기 ───────── */

/**
 * 남은 돈을 보낼 목표 — 곧 끝나는 목표 먼저, 없으면 우선순위 순.
 * 연결 계좌가 있는 진행 중 목표만 (순자산 기준 목표는 옮겨도 진척이 같다).
 */
export function pickSurplusGoal(goals: GoalView[]): GoalView | null {
  const eligible = goals.filter(
    (g) => g.status === "ACTIVE" && !g.usesNetWorth && g.linkedAccountIds.length > 0 && !g.evaluation.required.alreadyAchievable,
  );
  return eligible.find((g) => g.fastTrack) ?? eligible[0] ?? null;
}

/** 옮기기 기록의 받는 계좌(목표 첫 연결 계좌)와 보내는 계좌 기본값(월급 통장) */
export async function getMoveTarget(ctx: Ctx, goal: Pick<GoalView, "name" | "linkedAccountIds">): Promise<MoveTarget | null> {
  const toAccountId = goal.linkedAccountIds[0];
  if (!toAccountId) return null;
  const { fromAccountId } = await getAutoSaveSetup(ctx, goal.linkedAccountIds);
  return { goalName: goal.name, toAccountId, fromAccountId };
}

/* ───────── 자동이체 등록 기본값 ───────── */

/**
 * 보내는 계좌 = 정기 수입이 가장 많이 들어오는 통장, 이체일 = 그 수입일 다음 날.
 * existing = 연결 계좌로 이미 들어가는 진행 중 저축·이체 자동이체.
 */
export async function getAutoSaveSetup(ctx: Ctx, linkedIds: string[]) {
  const rules = await prisma.recurringRule.findMany({ where: { householdId: ctx.householdId, isActive: true } });
  const parsed = rules.map((r) => ({ name: r.name, day: r.dayOfMonth, t: r.template as unknown as RecurringTemplate }));
  const incomes = parsed.filter((r) => r.t.type === "INCOME" && r.t.toAccountId);
  const byAccount = new Map<string, number>();
  for (const r of incomes) byAccount.set(r.t.toAccountId!, (byAccount.get(r.t.toAccountId!) ?? 0) + Number(r.t.amount));
  const fromAccountId = [...byAccount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const payday = incomes.find((r) => r.t.toAccountId === fromAccountId)?.day ?? null;
  // 0 = 말일. 말일·28일 이후 월급이면 다음 달 1일
  const day = payday === null || payday === 0 || payday >= 28 ? 1 : payday + 1;
  const existing = parsed
    .filter((r) => (r.t.type === "SAVE_INVEST" || r.t.type === "TRANSFER") && !!r.t.toAccountId && linkedIds.includes(r.t.toAccountId))
    .map((r) => ({ name: r.name, amount: Number(r.t.amount), day: r.day }));
  return { fromAccountId, day, existing };
}
