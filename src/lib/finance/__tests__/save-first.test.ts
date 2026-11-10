import { describe, expect, it } from "vitest";
import { suggestSaveFirst, type ForecastRule } from "../forecast";

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
const salary = rule({ name: "월급", type: "INCOME", amount: 4_000_000n, dayOfMonth: 25, toAccountId: "a" });

describe("월급날 먼저 저축", () => {
  it("다음 월급 전날까지 가장 낮은 잔액에서 여유(30만 또는 2주치 지출)를 남기고 10만 단위, 받은 수입 이하", () => {
    // 25일 월급 400만 → 26일 생활비 250만 이체, 매일 2만 (2주치 28만 < 30만 → 30만 남김)
    const rules = [salary, rule({ name: "생활비 이체", type: "TRANSFER", amount: 2_500_000n, dayOfMonth: 26, fromAccountId: "a", toAccountId: "x" })];
    const [s] = suggestSaveFirst({ accounts: [{ id: "a", name: "급여", balance: 500_000n, dailySpend: 20_000n }], rules, cards: [], today });
    // 6일 50만 − 19일 × 2만 = 12만 → 25일 +400만 = 412만 → 26일 −250만 −2만 = 160만 → 12/24 까지 28일 × 2만 → 가장 낮을 때 104만
    // 104만 − 30만 = 74만 → 70만 옮기면 34만 남는다
    expect(s).toMatchObject({ accountId: "a", date: "2026-11-25", label: "월급", amount: 700_000n, keep: 340_000n });
  });

  it("남는 돈이 받은 수입보다 많아도 수입만큼만", () => {
    const [s] = suggestSaveFirst({ accounts: [{ id: "a", name: "급여", balance: 9_000_000n, dailySpend: 0n }], rules: [salary], cards: [], today });
    expect(s.amount).toBe(4_000_000n);
  });

  it("30일 안에 모자라는 통장·정기 수입이 없는 통장·여유가 10만 미만이면 권하지 않는다", () => {
    const card = { id: "c", name: "카드", billingDay: 20, paymentAccountId: "a", unpaid: 3_000_000n, dailySpend: 0n };
    expect(suggestSaveFirst({ accounts: [{ id: "a", name: "급여", balance: 1_000_000n, dailySpend: 0n }], rules: [salary], cards: [card], today })).toEqual([]);
    expect(suggestSaveFirst({ accounts: [{ id: "a", name: "급여", balance: 9_000_000n, dailySpend: 0n }], rules: [], cards: [], today })).toEqual([]);
    const spend = rule({ name: "생활비 이체", type: "TRANSFER", amount: 3_950_000n, dayOfMonth: 26, fromAccountId: "a", toAccountId: "x" });
    expect(suggestSaveFirst({ accounts: [{ id: "a", name: "급여", balance: 300_000n, dailySpend: 0n }], rules: [salary, spend], cards: [], today })).toEqual([]);
  });
});
