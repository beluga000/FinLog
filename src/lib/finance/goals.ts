import { monthsBetween } from "./period";
import {
  calculateMonthsToGoal,
  calculateRequiredInvestment,
  suggestAlternatives,
  type Alternatives,
  type RequiredResult,
} from "./projection";
import type { DateStr } from "./types";

/** 목표 진척·역산·대안 평가 (PROD.MD §4-6) */

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
