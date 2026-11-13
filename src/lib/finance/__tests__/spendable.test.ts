import { describe, expect, it } from "vitest";
import { getMonthRange } from "../period";
import {
  calculateSpendable,
  daysLeftInRange,
  summarizeSpendableInputs,
  type SpendableRule,
  type SpendableTx,
  weekResults,
  yesterdayResult,
} from "../spendable";

const base = { income: 8_200_000n, fixed: 2_150_000n, fixedSaving: 0n, goalSaving: 1_980_000n, variableExpense: 2_410_000n, daysLeft: 10 };

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

  it("고정 저축도 생활비에서 뺀다 — 계획 저축 = 고정 저축 + 목표 저축", () => {
    const s = calculateSpendable({ ...base, fixedSaving: 500_000n });
    expect(s.livingBudget).toBe(3_570_000n);
    expect(s.plannedSaving).toBe(2_480_000n);
    expect(s.remaining).toBe(1_160_000n);
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
    // 정기 저축(isa 50만)은 고정 저축으로 월초부터 빼고, 실현된 저축 거래는 다시 빼지 않는다
    expect(s).toEqual({ income: 8_200_000n, fixed: 2_150_000n, fixedSaving: 500_000n, goalSaving: 1_980_000n, variableExpense: 2_410_000n });
    expect(calculateSpendable({ ...s, daysLeft: 10 }).remaining).toBe(1_160_000n);
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

  it("고정 저축: 저축·투자와 대출 상환 규칙, 중지·기간 밖 규칙은 제외", () => {
    const more = [
      ...rules,
      rule({ id: "loan", type: "LOAN_REPAY", amount: 300_000n }),
      rule({ id: "paused", type: "SAVE_INVEST", amount: 1n, isActive: false }),
      rule({ id: "done", type: "SAVE_INVEST", amount: 2n, endDate: "2026-10-31" }),
      rule({ id: "move", type: "TRANSFER", amount: 4n }),
    ];
    expect(summarizeSpendableInputs({ rules: more, txs: [], goals: [], range, includeGoals: true }).fixedSaving).toBe(800_000n);
  });

  it("목표 연결 계좌로 들어가는 고정 저축은 목표 저축에서 빼서 한 번만 센다", () => {
    const saving = [
      rule({ id: "jeokgeum", type: "SAVE_INVEST", amount: 500_000n, toAccountId: "acc-savings" }),
      rule({ id: "other", type: "SAVE_INVEST", amount: 200_000n, toAccountId: "acc-stock" }),
    ];
    const linked = [
      { status: "ACTIVE" as const, monthly: 1_980_000n, linkedAccountIds: ["acc-savings"] },
      // 같은 계좌에 연결된 두 번째 목표 — 규칙은 앞선 목표에서 이미 썼으므로 다시 빼지 않는다
      { status: "ACTIVE" as const, monthly: 300_000n, linkedAccountIds: ["acc-savings"] },
    ];
    const s = summarizeSpendableInputs({ rules: saving, txs: [], goals: linked, range, includeGoals: true });
    expect(s.fixedSaving).toBe(700_000n);
    expect(s.goalSaving).toBe(1_480_000n + 300_000n);
  });

  it("고정 저축이 목표 월 저축보다 크면 목표 저축은 0 (음수로 내려가지 않음)", () => {
    const big = [rule({ id: "big", type: "SAVE_INVEST", amount: 3_000_000n, toAccountId: "a" })];
    const s = summarizeSpendableInputs({
      rules: big,
      txs: [],
      goals: [{ status: "ACTIVE", monthly: 1_000_000n, linkedAccountIds: ["a"] }],
      range,
      includeGoals: true,
    });
    expect(s).toMatchObject({ fixedSaving: 3_000_000n, goalSaving: 0n });
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

describe("yesterdayResult — 어제 아낀 돈", () => {
  const range = { start: "2026-11-01", end: "2026-12-01" };
  // 수입 310만, 고정비 10만 → 생활비 300만 (11월 30일)
  const rules: SpendableRule[] = [
    { id: "pay", type: "INCOME", amount: 3_100_000n, isActive: true, startDate: "2026-01-01", endDate: null },
    { id: "rent", type: "EXPENSE", amount: 100_000n, isActive: true, startDate: "2026-01-01", endDate: null },
  ];
  const input = (txs: SpendableTx[]) => ({ rules, txs, goals: [], range, includeGoals: true });

  it("어제 시작 시점 하루 몫 − 어제 쓴 돈 (오늘 쓴 돈·고정비 거래는 빼고)", () => {
    const txs: SpendableTx[] = [
      { type: "EXPENSE", amount: 290_000n, recurringRuleId: null, date: "2026-11-01" },
      { type: "EXPENSE", amount: 100_000n, recurringRuleId: "rent", date: "2026-11-01" },
      { type: "EXPENSE", amount: 40_000n, recurringRuleId: null, date: "2026-11-02" },
      { type: "EXPENSE", amount: 500_000n, recurringRuleId: null, date: "2026-11-03" },
    ];
    // 11/2 시작: 남은 271만 / 29일 = 93,448원 → 어제 4만 썼으니 53,448원 아낌
    expect(yesterdayResult(input(txs), "2026-11-03")).toBe(53_448n);
  });

  it("어제 하루 몫보다 많이 쓰면 음수", () => {
    const txs: SpendableTx[] = [{ type: "EXPENSE", amount: 200_000n, recurringRuleId: null, date: "2026-11-02" }];
    // 11/2 시작: 300만 / 29일 = 103,448원 − 20만
    expect(yesterdayResult(input(txs), "2026-11-03")).toBe(103_448n - 200_000n);
  });

  it("이번 달 첫날·날짜 없는 거래는 null", () => {
    expect(yesterdayResult(input([]), "2026-11-01")).toBeNull();
    expect(yesterdayResult(input([{ type: "EXPENSE", amount: 1n, recurringRuleId: null }]), "2026-11-03")).toBeNull();
  });
});

describe("weekResults — 홈 대표 카드의 이번 주 7칸", () => {
  const range = { start: "2026-11-01", end: "2026-12-01" };
  const rules: SpendableRule[] = [{ id: "pay", type: "INCOME", amount: 3_100_000n, isActive: true, startDate: "2026-01-01", endDate: null }];
  const input = (txs: SpendableTx[], r = range) => ({ rules, txs, goals: [], range: r, includeGoals: true });

  it("일요일부터 7일, 지난 날은 결과·오늘·다가올 날은 결과 없음", () => {
    const txs: SpendableTx[] = [{ type: "EXPENSE", amount: 200_000n, recurringRuleId: null, date: "2026-11-09" }];
    const week = weekResults(input(txs), "2026-11-11"); // 수요일
    expect(week.map((d) => d.date)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(week.map((d) => d.state)).toEqual(["past", "past", "past", "today", "future", "future", "future"]);
    expect(week[1].result! < 0n).toBe(true); // 월요일 20만 → 더 씀
    expect(week[0].result! > 0n).toBe(true); // 일요일 안 씀 → 아낌
    expect(week[3].result).toBeNull();
  });

  it("이번 달 시작 전 날은 outside", () => {
    const week = weekResults(input([]), "2026-11-03"); // 화요일, 11/1 일요일 시작
    expect(week[0].state).toBe("past");
    const r = { start: "2026-11-25", end: "2026-12-25" };
    const w2 = weekResults(input([], r), "2026-11-26"); // 목요일 — 22~24일은 지난달
    expect(w2.slice(0, 3).map((d) => d.state)).toEqual(["outside", "outside", "outside"]);
    expect(w2[3].state).toBe("past");
  });
});
