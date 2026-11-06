import { sumBigInt } from "./money";
import { addDays } from "./period";
import type { DateStr, TxType } from "./types";

/**
 * 이번 달 쓸 수 있는 돈 (PROD.MD §2-7).
 * 쓸 수 있는 돈 = 수입 − 고정비 − 고정 저축 − 목표 저축 − 변동 지출
 * 고정 저축 = 정기 저축·투자(SAVE_INVEST)·대출 상환(LOAN_REPAY) 규칙. 목표 저축은 고정 저축으로 이미 채운 만큼 뺀다.
 * 하루 권장액 = max(쓸 수 있는 돈, 0) / 남은 일수(오늘 포함)
 */

export interface SpendableInput {
  income: bigint;
  fixed: bigint;
  /** 정기 저축·투자·상환 규칙 합계 */
  fixedSaving: bigint;
  /** 고정 저축으로 채우지 못한 목표 저축 */
  goalSaving: bigint;
  variableExpense: bigint;
  /** 이번 달 남은 일수 (오늘 포함) */
  daysLeft: number;
}

export interface Spendable extends SpendableInput {
  /** 생활비 = 수입 − 고정비 − 고정 저축 − 목표 저축 */
  livingBudget: bigint;
  /** 이번 달 계획 저축 = 고정 저축 + 목표 저축 */
  plannedSaving: bigint;
  remaining: bigint;
  /** 오늘 쓸 수 있는 돈 (원 단위 내림) */
  daily: bigint;
  overspent: boolean;
  /** 생활비 대비 사용 비율 (생활비 ≤ 0 이면 null) */
  usedRatio: number | null;
}

export function calculateSpendable(input: SpendableInput): Spendable {
  const plannedSaving = input.fixedSaving + input.goalSaving;
  const livingBudget = input.income - input.fixed - plannedSaving;
  const remaining = livingBudget - input.variableExpense;
  const days = BigInt(Math.max(1, Math.trunc(input.daysLeft)));
  const daily = remaining > 0n ? remaining / days : 0n;
  return {
    ...input,
    livingBudget,
    plannedSaving,
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
  /** 저축이 들어가는 계좌 — 목표 연결 계좌와 겹치면 목표 저축에서 뺀다 */
  toAccountId?: string | null;
}

/** 고정 저축으로 보는 정기 규칙 유형 */
export const FIXED_SAVING_TYPES: TxType[] = ["SAVE_INVEST", "LOAN_REPAY"];

export interface SpendableTx {
  type: TxType;
  amount: bigint;
  recurringRuleId: string | null;
  /** 거래일 — 어제 결과(yesterdayResult)를 계산할 때만 쓴다 */
  date?: DateStr;
}

export interface SpendableGoal {
  status: "ACTIVE" | "ACHIEVED" | "PAUSED";
  /** monthlyCommit ?? 필요 납입액 (음수 = 이미 달성 가능) */
  monthly: bigint;
  /** 목표에 연결한 계좌 */
  linkedAccountIds?: string[];
}

/**
 * 정기 규칙·이번 달 거래·목표 → calculateSpendable 입력값.
 * 고정비는 이번 달에 걸치는 활성 EXPENSE 규칙 금액으로 월초부터 전액 잡는다.
 * 그 규칙이 만든 거래는 이미 고정비에 들어 있으므로 변동 지출에서 뺀다 (이중 차감 방지).
 * 수동으로 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
 * 고정 저축 규칙이 목표의 연결 계좌로 들어가면 그 목표의 월 저축은 이미 채워진 것으로 보고 남은 만큼만 목표 저축으로 잡는다
 * (같은 돈을 두 번 빼지 않게). 한 규칙은 우선순위가 앞선 목표 하나에만 쓴다.
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

  const savingRules = live.filter((r) => FIXED_SAVING_TYPES.includes(r.type));
  const used = new Set<string>();
  const goalSaving = input.includeGoals
    ? sumBigInt(
        input.goals
          .filter((g) => g.status === "ACTIVE" && g.monthly > 0n)
          .map((g) => {
            const linked = new Set(g.linkedAccountIds ?? []);
            const covering = savingRules.filter((r) => !used.has(r.id) && r.toAccountId && linked.has(r.toAccountId));
            covering.forEach((r) => used.add(r.id));
            const rest = g.monthly - sumBigInt(covering.map((r) => r.amount));
            return rest > 0n ? rest : 0n;
          }),
      )
    : 0n;

  return {
    income: actualIncome > plannedIncome ? actualIncome : plannedIncome,
    fixed: sumBigInt(live.filter((r) => r.type === "EXPENSE").map((r) => r.amount)),
    fixedSaving: sumBigInt(savingRules.map((r) => r.amount)),
    goalSaving,
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

/**
 * 어제 결과 = 어제 시작 시점의 하루 권장액 − 어제 쓴 변동 지출.
 * 양수면 아낀 만큼 오늘부터의 하루 몫이 늘고, 음수면 줄었다. 이번 달 첫날이거나 날짜 없는 거래가 있으면 null.
 */
export function yesterdayResult(
  input: Parameters<typeof summarizeSpendableInputs>[0],
  today: DateStr,
): bigint | null {
  const yesterday = addDays(today, -1);
  if (yesterday < input.range.start) return null;
  if (input.txs.some((t) => !t.date)) return null;
  const before = summarizeSpendableInputs({ ...input, txs: input.txs.filter((t) => t.date! < yesterday) });
  const through = summarizeSpendableInputs({ ...input, txs: input.txs.filter((t) => t.date! <= yesterday) });
  const allowance = calculateSpendable({ ...before, daysLeft: daysLeftInRange(yesterday, input.range) }).daily;
  return allowance - (through.variableExpense - before.variableExpense);
}
