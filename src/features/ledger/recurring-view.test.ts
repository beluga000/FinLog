import { describe, expect, it } from "vitest";
import { groupOf, scheduleOf, summarizeRecurring, type RecurringRuleInput } from "./recurring-view";

const TODAY = "2026-11-03";
const rule = (over: Partial<RecurringRuleInput> & { type?: RecurringRuleInput["template"]["type"]; amount?: string }): RecurringRuleInput => ({
  id: "r",
  dayOfMonth: 25,
  businessDayAdjust: "NONE",
  startDate: "2026-01-01",
  endDate: null,
  lastRunOn: "2026-10-25",
  isActive: true,
  ...over,
  template: {
    type: over.type ?? "EXPENSE",
    amount: over.amount ?? "10000",
    fromAccountId: null,
    toAccountId: null,
    categoryId: null,
    merchant: null,
    memo: null,
    visibility: "SHARED",
  },
});

describe("groupOf", () => {
  it("저축·투자와 대출상환은 같은 묶음, 이체는 따로", () => {
    expect(groupOf("SAVE_INVEST")).toBe("SAVING");
    expect(groupOf("LOAN_REPAY")).toBe("SAVING");
    expect(groupOf("TRANSFER")).toBe("TRANSFER");
  });
});

describe("scheduleOf", () => {
  it("진행 중이면 다음 생성일과 D-day", () => {
    expect(scheduleOf(rule({}), TODAY)).toEqual({ status: "active", next: "2026-11-25", dDay: 22 });
  });
  it("중지·종료일 지남·남은 회차 없음", () => {
    expect(scheduleOf(rule({ isActive: false }), TODAY).status).toBe("paused");
    expect(scheduleOf(rule({ endDate: "2026-10-31" }), TODAY).status).toBe("ended");
    expect(scheduleOf(rule({ endDate: "2026-11-20" }), TODAY)).toEqual({ status: "ended", next: null, dDay: null });
  });
});

describe("summarizeRecurring", () => {
  it("진행 중 규칙만 합산하고 이체는 남는 돈에서 빼지 않는다", () => {
    const s = summarizeRecurring(
      [
        rule({ type: "INCOME", amount: "3000000" }),
        rule({ type: "EXPENSE", amount: "800000" }),
        rule({ type: "SAVE_INVEST", amount: "500000" }),
        rule({ type: "LOAN_REPAY", amount: "200000" }),
        rule({ type: "TRANSFER", amount: "100000" }),
        rule({ type: "EXPENSE", amount: "999999", isActive: false }),
      ],
      TODAY,
    );
    expect(s).toEqual({ income: 3_000_000n, expense: 800_000n, saving: 700_000n, remaining: 1_500_000n });
  });
});
