import { describe, expect, it } from "vitest";
import { bigOutflowsBefore, forecastBalances, pickTransferSource, roundUpToManwon, upcomingRuleDates, type ForecastRule } from "../forecast";

const rule = (r: Partial<ForecastRule> & Pick<ForecastRule, "name" | "type" | "amount" | "dayOfMonth">): ForecastRule => ({
  businessDayAdjust: "NONE",
  startDate: "2026-01-01",
  endDate: null,
  lastRunOn: null,
  fromAccountId: null,
  toAccountId: null,
  ...r,
});

describe("규칙 발생일", () => {
  it("오늘 포함, 이미 실행한 날·끝난 규칙은 빼고", () => {
    expect(upcomingRuleDates(rule({ name: "월급", type: "INCOME", amount: 1n, dayOfMonth: 25 }), "2026-11-06", "2026-12-06")).toEqual(["2026-11-25"]);
    expect(upcomingRuleDates(rule({ name: "x", type: "EXPENSE", amount: 1n, dayOfMonth: 6, lastRunOn: "2026-11-06" }), "2026-11-06", "2026-12-06")).toEqual(["2026-12-06"]);
    expect(upcomingRuleDates(rule({ name: "x", type: "EXPENSE", amount: 1n, dayOfMonth: 6, endDate: "2026-11-30" }), "2026-11-06", "2026-12-06")).toEqual(["2026-11-06"]);
  });
});

describe("통장 잔액 예보", () => {
  const today = "2026-11-06";
  const accounts = [
    { id: "living", name: "생활비 통장", balance: 3_000_000n, dailySpend: 10_000n },
    { id: "salary", name: "민수 급여통장", balance: 6_050_000n, dailySpend: 0n },
  ];
  const rules = [
    rule({ name: "관리비", type: "EXPENSE", amount: 250_000n, dayOfMonth: 21, fromAccountId: "living" }),
    rule({ name: "월급", type: "INCOME", amount: 4_000_000n, dayOfMonth: 25, toAccountId: "salary" }),
    rule({ name: "생활비 이체", type: "TRANSFER", amount: 2_000_000n, dayOfMonth: 26, fromAccountId: "salary", toAccountId: "living" }),
  ];
  const cards = [{ id: "card", name: "생활비 카드", billingDay: 20, paymentAccountId: "living", unpaid: 2_721_400n, dailySpend: 50_000n }];

  it("카드 대금·관리비로 21일에 모자라고, 26일 생활비가 들어오면 회복", () => {
    const [living, salary] = forecastBalances({ accounts, rules, cards, today });
    expect(living.points).toHaveLength(31);
    // 6일 300만 → 20일까지 14일 × 1만 → 20일 카드 272.1만 → 21일 관리비 25만 → 25일까지 매일 1만
    expect(living.points.find((p) => p.date === "2026-11-20")?.balance).toBe(3_000_000n - 140_000n - 2_721_400n);
    expect(living.shortfall).toEqual({ date: "2026-11-21", amount: 161_400n });
    expect(living.low.date).toBe("2026-11-25");
    expect(living.points.find((p) => p.date === "2026-11-26")!.balance > 0n).toBe(true);
    expect(salary.shortfall).toBeNull();

    expect(bigOutflowsBefore(living, living.shortfall!.date).map((e) => e.label)).toEqual(["생활비 카드 대금", "관리비"]);
    expect(pickTransferSource([living, salary], "living", roundUpToManwon(living.shortfall!.amount))?.id).toBe("salary");
  });

  it("한 달 안에 두 번 결제하면 두 번째는 그 사이 쓸 금액", () => {
    const [living] = forecastBalances({ accounts: [{ ...accounts[0], dailySpend: 0n }], rules: [], cards: [{ ...cards[0], billingDay: 6 }], today });
    expect(living.events.map((e) => [e.date, e.amount])).toEqual([
      ["2026-11-06", -2_721_400n],
      ["2026-12-06", -50_000n * 30n],
    ]);
  });

  it("만 원 단위로 올림", () => {
    expect(roundUpToManwon(130_001n)).toBe(140_000n);
    expect(roundUpToManwon(130_000n)).toBe(130_000n);
  });
});
