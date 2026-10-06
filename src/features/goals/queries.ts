import "server-only";
import { getAccountOverview } from "@/features/accounts/queries";
import { getSavingCapacity } from "@/features/dashboard/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma } from "@/lib/db/prisma";
import { allocateByPriority, evaluateGoal, type GoalEvaluation } from "@/lib/finance/goals";
import { calculateRequiredInvestment } from "@/lib/finance/projection";
import { monthsBetween } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

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
  /** 연결 계좌가 없어 순자산을 기준으로 삼았는지 */
  usesNetWorth: boolean;
  /** 배분된 월 납입액 (확정값 또는 우선순위 배분) */
  contribution: number;
  contributionSource: "commit" | "allocated";
  shortfall: number;
  evaluation: GoalEvaluation;
}

export async function getGoalsOverview(ctx: Ctx, opts: { today: DateStr; monthStartDay: number }) {
  const [goals, overview, capacity] = await Promise.all([
    prisma.assetGoal.findMany({ where: { householdId: ctx.householdId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    getAccountOverview(ctx, "us", { today: opts.today, monthStartDay: opts.monthStartDay, trendMonths: 1 }),
    getSavingCapacity(ctx, opts),
  ]);
  const balanceById = new Map(overview.accounts.map((a) => [a.id, a]));
  const netWorth = Number(overview.netWorth.netWorth);

  const base = goals.map((g) => {
    const linked = g.linkedAccountIds.map((id) => balanceById.get(id)).filter((a) => !!a);
    const usesNetWorth = linked.length === 0;
    const current = usesNetWorth ? Math.max(0, netWorth) : linked.reduce((s, a) => s + Number(a.balance), 0);
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
      targetDate,
      expectedReturn,
      target,
      commit,
      demand: g.status === "ACTIVE" ? commit ?? required.monthly : 0,
    };
  });

  const allocation = allocateByPriority(
    base.map((b) => ({ id: b.g.id, priority: b.g.priority, demand: b.demand })),
    capacity.capacity,
  );

  const views: GoalView[] = base.map((b) => {
    const alloc = allocation.get(b.g.id) ?? { allocated: 0, shortfall: 0 };
    const contribution = b.commit ?? alloc.allocated;
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
      usesNetWorth: b.usesNetWorth,
      contribution,
      contributionSource: b.commit !== null ? "commit" : "allocated",
      shortfall: alloc.shortfall,
      evaluation: evaluateGoal({
        target: b.target,
        targetIsReal: b.g.targetIsReal,
        targetDate: b.targetDate,
        expectedReturn: b.expectedReturn,
        current: b.current,
        monthlyContribution: contribution,
        today: opts.today,
        inflation: DEFAULT_INFLATION,
        higherReturn: higherReturnOf(b.expectedReturn),
      }),
    };
  });

  const totalDemand = base.reduce((s, b) => s + b.demand, 0);
  const accounts = overview.accounts.map(({ id, name, type }) => ({ id, name, type }));
  return { goals: views, capacity, totalDemand, accounts, netWorth };
}
