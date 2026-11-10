import { describe, expect, it } from "vitest";
import { findIdleMoney, suggestSaveFirst, type ForecastAccount, type ForecastRule } from "../forecast";

const rule = (r: Partial<ForecastRule> & Pick<ForecastRule, "name" | "type" | "amount" | "dayOfMonth">): ForecastRule => ({
  businessDayAdjust: "NONE",
  startDate: "2026-01-01",
  endDate: null,
  lastRunOn: null,
  fromAccountId: null,
  toAccountId: null,
  ...r,
});
const today = "2026-11-06";
const acct = (balance: bigint, dailySpend = 0n): ForecastAccount => ({ id: "a", name: "급여", balance, dailySpend });
const none = { saveFirst: [] };

describe("놀고 있는 돈", () => {
  it("30일 내내 남는 돈에서 여유(30만 또는 2주치 지출)를 남기고 10만 단위", () => {
    // 매일 3만 → 2주치 42만 남김. 500만 − 30일 × 3만 = 410만이 가장 낮을 때 → 410 − 42 = 368 → 360만
    const input = { accounts: [acct(5_000_000n, 30_000n)], rules: [], cards: [], today };
    expect(findIdleMoney(input, none)).toEqual([{ accountId: "a", amount: 3_600_000n, keep: 500_000n }]);
  });

  it("월급날 선저축으로 옮길 몫은 빼고 잰다 — 원래 있던 돈만", () => {
    const salary = rule({ name: "월급", type: "INCOME", amount: 4_000_000n, dayOfMonth: 25, toAccountId: "a" });
    const input = { accounts: [acct(9_000_000n)], rules: [salary], cards: [], today };
    const saveFirst = suggestSaveFirst(input);
    expect(saveFirst[0].amount).toBe(4_000_000n);
    // 월급 전 900만이 가장 낮다 (월급 뒤 1,300만 − 선저축 400만 = 900만) → 900 − 30 = 870만
    expect(findIdleMoney(input, { ...none, saveFirst })).toEqual([{ accountId: "a", amount: 8_700_000n, keep: 300_000n }]);
  });

  it("모자라는 통장·50만 미만은 말하지 않는다", () => {
    const input = { accounts: [acct(5_000_000n)], rules: [], cards: [], today };
    const card = { id: "c", name: "카드", billingDay: 20, paymentAccountId: "a", unpaid: 6_000_000n, dailySpend: 0n };
    expect(findIdleMoney({ ...input, cards: [card] }, none)).toEqual([]);
    expect(findIdleMoney({ ...input, accounts: [acct(790_000n)] }, none)).toEqual([]);
    expect(findIdleMoney({ ...input, accounts: [acct(800_000n)] }, none)).toEqual([{ accountId: "a", amount: 500_000n, keep: 300_000n }]);
  });

  it("큰 지출이 예정돼 있으면 그 뒤 잔액 기준", () => {
    const rent = rule({ name: "월세", type: "EXPENSE", amount: 1_000_000n, dayOfMonth: 10, fromAccountId: "a" });
    const input = { accounts: [acct(3_000_000n)], rules: [rent], cards: [], today };
    // 10일 월세 뒤 200만 → 200 − 30 = 170만
    expect(findIdleMoney(input, none)[0].amount).toBe(1_700_000n);
  });
});
