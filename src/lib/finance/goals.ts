import { monthsBetween } from "./period";
import {
  calculateMonthsToGoal,
  calculateRequiredInvestment,
  futureValue,
  toMonthlyRate,
  suggestAlternatives,
  type Alternatives,
  type RequiredResult,
} from "./projection";
import type { DateStr } from "./types";

/** 목표 진척·역산·대안 평가 (PROD.MD §4-6) */

/**
 * 목표에 모인 돈. 계좌에 원래 있던 돈을 통째로 목표 진척으로 치지 않도록,
 * 목표를 만들 때 정한 시작 금액에 그 뒤로 늘어난(줄어든) 잔액만 더한다.
 * basis = 지금 기준 잔액(연결 계좌 합계, 없으면 순자산).
 */
export function goalCurrent(g: { startAmount: number; baseBalance: number }, basis: number): number {
  return Math.max(0, g.startAmount + basis - g.baseBalance);
}

/** 목표 저장 시 시작 금액 — 0 이상, 지금 기준 잔액(음수면 0)을 넘지 않게 */
export function clampStartAmount(start: number, basis: number): number {
  return Math.min(Math.max(0, start), Math.max(0, basis));
}

/** 진행률 알림 단계 */
export const MILESTONES = [25, 50, 75, 100] as const;

/** 지금 진척률로 넘은 가장 높은 단계 (0 = 아직 25% 전) */
export function reachedMilestone(progress: number): number {
  const pct = progress * 100;
  return MILESTONES.reduce<number>((top, m) => (pct >= m - 1e-9 ? m : top), 0);
}

/** 아직 보지 않은 새 단계 — 없으면 null */
export function newMilestone(progress: number, seen: number): number | null {
  const reached = reachedMilestone(progress);
  return reached > seen ? reached : null;
}

/**
 * 계획선 — 기준일에 모인 돈(start)에서 출발해 목표일(months 뒤)에 목표 금액에 닿도록 매달 같은 금액을 넣는 경로.
 * 반환 함수는 기준일로부터 m개월 뒤 계획 금액.
 */
export function goalPlanPath(p: {
  start: number;
  months: number;
  target: number;
  targetIsReal: boolean;
  expectedReturn: number;
  inflation?: number;
}): (m: number) => number {
  const required = calculateRequiredInvestment({
    target: p.target,
    pv: p.start,
    months: p.months,
    annualReturn: p.expectedReturn,
    targetIsReal: p.targetIsReal,
    inflation: p.inflation,
  });
  const r = toMonthlyRate(p.expectedReturn);
  const pmt = required.alreadyAchievable ? 0 : required.monthly;
  return (m) => Math.round(futureValue(p.start, pmt, r, Math.max(0, m)));
}

export interface GoalClaim {
  goalId: string;
  name: string;
  amount: number;
}

/**
 * 계좌별로 다른 목표가 이미 쓰는 돈. 목표 하나가 계좌 여러 개를 고르면 모인 돈을 잔액 비율로 나눠 계좌마다 얹는다.
 * 달성한 목표도 돈이 계좌에 남아 있으므로 함께 센다.
 */
export function claimsByAccount(
  goals: { id: string; name: string; current: number; linkedAccountIds: string[] }[],
  balances: Map<string, number>,
): Map<string, GoalClaim[]> {
  const out = new Map<string, GoalClaim[]>();
  for (const g of goals) {
    const ids = g.linkedAccountIds.filter((id) => balances.has(id));
    if (!ids.length || g.current <= 0) continue;
    const positive = ids.map((id) => Math.max(0, balances.get(id)!));
    const sum = positive.reduce((s, b) => s + b, 0);
    ids.forEach((id, i) => {
      const amount = Math.round(sum > 0 ? (g.current * positive[i]) / sum : g.current / ids.length);
      if (amount <= 0) return;
      out.set(id, [...(out.get(id) ?? []), { goalId: g.id, name: g.name, amount }]);
    });
  }
  return out;
}

export interface GoalInput {
  target: number;
  targetIsReal: boolean;
  targetDate: DateStr;
  expectedReturn: number;
  /** 연결 계좌 현재 합계 */
  current: number;
  /** 목표에 배정된 월 납입액 (확정값 → 없으면 저축 가능액 배분액) */
  monthlyContribution: number;
  today: DateStr;
  inflation?: number;
  /** 대안 (c) 계산용 더 높은 수익률 */
  higherReturn?: number;
}

export interface GoalEvaluation {
  monthsLeft: number;
  required: RequiredResult;
  /** 현재 금액 / 목표 금액 (0~1+) */
  progress: number;
  /** 현재 납입액 유지 시 달성까지 개월 수 */
  projectedMonths: number | null;
  /** 양수 = 목표일보다 N개월 빠름, 음수 = 늦음, null = 100년 내 불가 */
  aheadMonths: number | null;
  onTrack: boolean;
  alternatives: Alternatives | null;
}

export function evaluateGoal(g: GoalInput): GoalEvaluation {
  const inflation = g.inflation ?? 0.025;
  const monthsLeft = monthsBetween(g.today, g.targetDate);
  const required = calculateRequiredInvestment({
    target: g.target,
    pv: g.current,
    months: monthsLeft,
    annualReturn: g.expectedReturn,
    targetIsReal: g.targetIsReal,
    inflation,
  });
  const projectedMonths = calculateMonthsToGoal({
    target: g.target,
    pv: g.current,
    pmt: g.monthlyContribution,
    annualReturn: g.expectedReturn,
    targetIsReal: g.targetIsReal,
    inflation,
  });
  const aheadMonths = projectedMonths === null ? null : monthsLeft - projectedMonths;
  const onTrack = required.alreadyAchievable || g.monthlyContribution >= required.monthly;
  return {
    monthsLeft,
    required,
    progress: g.target > 0 ? g.current / g.target : 1,
    projectedMonths,
    aheadMonths,
    onTrack,
    alternatives: onTrack
      ? null
      : suggestAlternatives({
          target: g.target,
          pv: g.current,
          months: monthsLeft,
          annualReturn: g.expectedReturn,
          targetIsReal: g.targetIsReal,
          inflation,
          capacity: g.monthlyContribution,
          higherReturn: g.higherReturn,
        }),
  };
}

/**
 * 우선순위 순으로 저축 가능액을 배분 (PROD.MD §4-6 마지막 항목).
 * 확정 납입액(commit)이 있는 목표는 그 금액을, 없으면 필요액을 요구한다.
 */
export function allocateByPriority<T extends { id: string; priority: number; demand: number }>(
  goals: T[],
  capacity: number,
): Map<string, { allocated: number; shortfall: number }> {
  const result = new Map<string, { allocated: number; shortfall: number }>();
  let left = Math.max(0, capacity);
  for (const g of [...goals].sort((a, b) => a.priority - b.priority)) {
    const allocated = Math.min(left, Math.max(0, g.demand));
    left -= allocated;
    result.set(g.id, { allocated, shortfall: Math.max(0, g.demand - allocated) });
  }
  return result;
}

export interface PriorityRaise {
  /** 올린 뒤 이 목표의 배정액 */
  allocated: number;
  gain: number;
  /** 올려도 요구액에 모자란 월 금액 (0 = 해결) */
  shortfall: number;
  /** 대신 배정이 줄어드는 목표 */
  displaced: { id: string; loss: number }[];
}

/**
 * 우선순위를 "바로 위 진행 중 목표" 위로 한 칸 올렸을 때의 배분 (§4-6 대안 (d)).
 * goals 는 지금 우선순위 순서. 진행 중이 아닌 목표(일시정지·달성)는 배분에 영향이 없어 건너뛴다.
 * 위에 진행 중 목표가 없거나 올려도 배정이 늘지 않으면 null.
 */
export function simulatePriorityRaise(
  goals: { id: string; demand: number; active: boolean }[],
  capacity: number,
  id: string,
): PriorityRaise | null {
  const i = goals.findIndex((g) => g.id === id);
  if (i < 0) return null;
  let j = i - 1;
  while (j >= 0 && !goals[j].active) j--;
  if (j < 0) return null;
  const raised = [...goals];
  const [me] = raised.splice(i, 1);
  raised.splice(j, 0, me);
  const rank = (list: typeof goals) => list.map((g, idx) => ({ id: g.id, priority: idx, demand: g.demand }));
  const before = allocateByPriority(rank(goals), capacity);
  const after = allocateByPriority(rank(raised), capacity);
  const now = after.get(id)!;
  const gain = now.allocated - before.get(id)!.allocated;
  if (gain <= 0) return null;
  const displaced = goals
    .filter((g) => g.id !== id)
    .map((g) => ({ id: g.id, loss: before.get(g.id)!.allocated - after.get(g.id)!.allocated }))
    .filter((d) => d.loss > 0);
  return { allocated: now.allocated, gain, shortfall: now.shortfall, displaced };
}
