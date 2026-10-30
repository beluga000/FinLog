import { describe, expect, it } from "vitest";
import { getMonthRange } from "../period";
import {
  calculateSpendable,
  daysLeftInRange,
  summarizeSpendableInputs,
  type SpendableRule,
  type SpendableTx,
} from "../spendable";

const base = { income: 8_200_000n, fixed: 2_150_000n, goalSaving: 1_980_000n, variableExpense: 2_410_000n, daysLeft: 10 };

describe("쓸 수 있는 돈 — PROD.MD §4 기준값", () => {
  it("AC-12: 820만 − 215만 − 198만 − 241만 = 166만, 남은 10일 → 하루 16.6만", () => {
    const s = calculateSpendable(base);
    expect(s.livingBudget).toBe(4_070_000n);
    expect(s.remaining).toBe(1_660_000n);
    expect(s.daily).toBe(166_000n);
    expect(s.overspent).toBe(false);
  });

  it("변동 지출 54,000 추가 → 160.6만, 오늘 권장 16.6만 → 11.2만", () => {
    const before = calculateSpendable(base);
    const after = calculateSpendable({ ...base, variableExpense: base.variableExpense + 54_000n });
    expect(after.remaining).toBe(1_606_000n);
    expect(before.daily - 54_000n).toBe(112_000n);
  });

  it("초과 시 음수 잔액과 하루 권장 0", () => {
    const s = calculateSpendable({ ...base, variableExpense: 5_000_000n });
    expect(s.remaining).toBe(-930_000n);
    expect(s.daily).toBe(0n);
    expect(s.overspent).toBe(true);
  });

  it("남은 일수 0 이하는 1일로 취급, 원 단위 내림", () => {
    expect(calculateSpendable({ ...base, daysLeft: 0 }).daily).toBe(1_660_000n);
    expect(calculateSpendable({ ...base, variableExpense: 2_410_001n, daysLeft: 3 }).daily).toBe(553_333n);
  });

  it("생활비가 0 이하면 사용 비율은 null", () => {
    expect(calculateSpendable({ ...base, goalSaving: 7_000_000n }).usedRatio).toBeNull();
    expect(calculateSpendable(base).usedRatio).toBeCloseTo(2_410_000 / 4_070_000);
  });
});

describe("쓸 수 있는 돈 입력 집계", () => {
  const range = getMonthRange("2026-11", 1);
  const rule = (p: Partial<SpendableRule> & Pick<SpendableRule, "id" | "type" | "amount">): SpendableRule => ({
    isActive: true,
    startDate: "2026-01-01",
    endDate: null,
    ...p,
  });
  const rules = [
    rule({ id: "salary", type: "INCOME", amount: 8_200_000n }),
    rule({ id: "rent", type: "EXPENSE", amount: 1_200_000n }),
    rule({ id: "insurance", type: "EXPENSE", amount: 700_000n }),
    rule({ id: "phone", type: "EXPENSE", amount: 250_000n }),
    rule({ id: "isa", type: "SAVE_INVEST", amount: 500_000n }),
  ];
  const goals = [
    { status: "ACTIVE" as const, monthly: 1_980_000n },
    { status: "ACTIVE" as const, monthly: -10_000n },
    { status: "PAUSED" as const, monthly: 300_000n },
  ];

  it("AC-14: 정기 규칙이 만든 고정 지출은 실현돼도 다시 차감하지 않는다", () => {
    const txs: SpendableTx[] = [
      { type: "INCOME", amount: 8_200_000n, recurringRuleId: "salary" },
      { type: "EXPENSE", amount: 1_200_000n, recurringRuleId: "rent" },
      { type: "EXPENSE", amount: 700_000n, recurringRuleId: "insurance" },
      { type: "EXPENSE", amount: 2_410_000n, recurringRuleId: null },
      { type: "SAVE_INVEST", amount: 500_000n, recurringRuleId: "isa" },
      { type: "TRANSFER", amount: 900_000n, recurringRuleId: null },
    ];
    const s = summarizeSpendableInputs({ rules, txs, goals, range, includeGoals: true });
    expect(s).toEqual({ income: 8_200_000n, fixed: 2_150_000n, goalSaving: 1_980_000n, variableExpense: 2_410_000n });
    expect(calculateSpendable({ ...s, daysLeft: 10 }).remaining).toBe(1_660_000n);
  });

  it("수동으로 고정 체크한 지출(규칙 없음)과 비활성 규칙이 만든 지출은 변동 지출로 센다", () => {
    const txs: SpendableTx[] = [
      { type: "EXPENSE", amount: 100_000n, recurringRuleId: null },
      { type: "EXPENSE", amount: 30_000n, recurringRuleId: "gym" },
    ];
    const withInactive = [...rules, rule({ id: "gym", type: "EXPENSE", amount: 30_000n, isActive: false })];
    const s = summarizeSpendableInputs({ rules: withInactive, txs, goals, range, includeGoals: true });
    expect(s.fixed).toBe(2_150_000n);
    expect(s.variableExpense).toBe(130_000n);
  });

  it("수입은 계획(규칙)과 실제 중 큰 값", () => {
    const bonus: SpendableTx[] = [
      { type: "INCOME", amount: 8_200_000n, recurringRuleId: "salary" },
      { type: "INCOME", amount: 1_000_000n, recurringRuleId: null },
    ];
    expect(summarizeSpendableInputs({ rules, txs: bonus, goals, range, includeGoals: true }).income).toBe(9_200_000n);
    expect(summarizeSpendableInputs({ rules, txs: [], goals, range, includeGoals: true }).income).toBe(8_200_000n);
  });

  it("이번 달에 걸치지 않는 규칙은 제외", () => {
    const dated = [
      rule({ id: "ended", type: "EXPENSE", amount: 1n, endDate: "2026-10-31" }),
      rule({ id: "future", type: "EXPENSE", amount: 2n, startDate: "2026-12-01" }),
      rule({ id: "endsMid", type: "EXPENSE", amount: 4n, endDate: "2026-11-15" }),
    ];
    expect(summarizeSpendableInputs({ rules: dated, txs: [], goals: [], range, includeGoals: true }).fixed).toBe(4n);
  });

  it("나/배우자 뷰는 목표 저축을 차감하지 않고, 목표가 없으면 0", () => {
    expect(summarizeSpendableInputs({ rules, txs: [], goals, range, includeGoals: false }).goalSaving).toBe(0n);
    expect(summarizeSpendableInputs({ rules, txs: [], goals: [], range, includeGoals: true }).goalSaving).toBe(0n);
  });
});

describe("남은 일수", () => {
  it("오늘 포함, 월 시작일 25일 경계", () => {
    expect(daysLeftInRange("2026-11-21", getMonthRange("2026-11", 1))).toBe(10);
    expect(daysLeftInRange("2026-11-30", getMonthRange("2026-11", 1))).toBe(1);
    expect(daysLeftInRange("2026-11-24", getMonthRange("2026-11", 25))).toBe(1);
    expect(daysLeftInRange("2026-10-25", getMonthRange("2026-11", 25))).toBe(31);
  });
});
