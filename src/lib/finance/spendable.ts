import { sumBigInt } from "./money";
import type { DateStr, TxType } from "./types";

/**
 * 이번 달 쓸 수 있는 돈 (PROD.MD §2-7).
 * 쓸 수 있는 돈 = 수입 − 고정비 − 목표 저축 − 변동 지출
 * 하루 권장액 = max(쓸 수 있는 돈, 0) / 남은 일수(오늘 포함)
 */

export interface SpendableInput {
  income: bigint;
  fixed: bigint;
  goalSaving: bigint;
  variableExpense: bigint;
  /** 이번 달 남은 일수 (오늘 포함) */
  daysLeft: number;
}

export interface Spendable extends SpendableInput {
  /** 생활비 = 수입 − 고정비 − 목표 저축 */
  livingBudget: bigint;
  remaining: bigint;
  /** 오늘 쓸 수 있는 돈 (원 단위 내림) */
  daily: bigint;
  overspent: boolean;
  /** 생활비 대비 사용 비율 (생활비 ≤ 0 이면 null) */
  usedRatio: number | null;
}

export function calculateSpendable(input: SpendableInput): Spendable {
  const livingBudget = input.income - input.fixed - input.goalSaving;
  const remaining = livingBudget - input.variableExpense;
  const days = BigInt(Math.max(1, Math.trunc(input.daysLeft)));
  const daily = remaining > 0n ? remaining / days : 0n;
  return {
    ...input,
    livingBudget,
    remaining,
    daily,
    overspent: remaining < 0n,
    usedRatio: livingBudget > 0n ? Number(input.variableExpense) / Number(livingBudget) : null,
  };
}

export interface SpendableRule {
  id: string;
  type: TxType;
  amount: bigint;
  isActive: boolean;
  startDate: DateStr;
  endDate: DateStr | null;
}

export interface SpendableTx {
  type: TxType;
  amount: bigint;
  recurringRuleId: string | null;
}

export interface SpendableGoal {
  status: "ACTIVE" | "ACHIEVED" | "PAUSED";
  /** monthlyCommit ?? 필요 납입액 (음수 = 이미 달성 가능) */
  monthly: bigint;
}

/**
 * 정기 규칙·이번 달 거래·목표 → calculateSpendable 입력값.
 * 고정비는 이번 달에 걸치는 활성 EXPENSE 규칙 금액으로 월초부터 전액 잡는다.
 * 그 규칙이 만든 거래는 이미 고정비에 들어 있으므로 변동 지출에서 뺀다 (이중 차감 방지).
 * 수동으로 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
 */
export function summarizeSpendableInputs(input: {
  rules: SpendableRule[];
  txs: SpendableTx[];
  goals: SpendableGoal[];
  range: { start: DateStr; end: DateStr };
  /** 나/배우자 뷰는 가구 공동 목표 저축을 차감하지 않는다 */
  includeGoals: boolean;
}): Omit<SpendableInput, "daysLeft"> {
  const { range } = input;
  const live = input.rules.filter(
    (r) => r.isActive && r.startDate < range.end && (r.endDate === null || r.endDate >= range.start),
  );
  const reserved = new Set(live.filter((r) => r.type === "EXPENSE").map((r) => r.id));

  const plannedIncome = sumBigInt(live.filter((r) => r.type === "INCOME").map((r) => r.amount));
  const actualIncome = sumBigInt(input.txs.filter((t) => t.type === "INCOME").map((t) => t.amount));

  return {
    income: actualIncome > plannedIncome ? actualIncome : plannedIncome,
    fixed: sumBigInt(live.filter((r) => r.type === "EXPENSE").map((r) => r.amount)),
    goalSaving: input.includeGoals
      ? sumBigInt(input.goals.filter((g) => g.status === "ACTIVE" && g.monthly > 0n).map((g) => g.monthly))
      : 0n,
    variableExpense: sumBigInt(
      input.txs
        .filter((t) => t.type === "EXPENSE" && !(t.recurringRuleId && reserved.has(t.recurringRuleId)))
        .map((t) => t.amount),
    ),
  };
}

/** 이번 달 남은 일수 (오늘 포함). range.end 는 다음 달 시작일(배타). */
export function daysLeftInRange(today: DateStr, range: { start: DateStr; end: DateStr }): number {
  const ms = Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}
