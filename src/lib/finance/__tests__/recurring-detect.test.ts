import { describe, expect, it } from "vitest";
import { findRecurringCandidates, recurringCandidateKey, type DetectTx } from "../recurring-detect";

const tx = (date: string, amount: number, over: Partial<DetectTx> = {}): DetectTx => ({
  type: "EXPENSE",
  date,
  amount: BigInt(amount),
  merchant: "넷플릭스",
  categoryId: "c-sub",
  fromAccountId: "card",
  toAccountId: null,
  visibility: "SHARED",
  recurringRuleId: null,
  ...over,
});

const opts = (over: Partial<Parameters<typeof findRecurringCandidates>[1]> = {}) => ({
  today: "2026-11-10",
  ruleKeys: new Set<string>(),
  dismissed: new Set<string>(),
  ...over,
});

const netflix = [tx("2026-08-05", 17_000), tx("2026-09-05", 17_000), tx("2026-10-06", 17_000), tx("2026-11-05", 17_000)];

describe("정기 결제 찾기", () => {
  it("3달 이상·비슷한 날·같은 금액이면 후보 — 최근 금액·가운데 날·다음 날 시작", () => {
    const [c] = findRecurringCandidates(netflix, opts());
    expect(c).toMatchObject({
      key: recurringCandidateKey("EXPENSE", "넷플릭스"),
      merchant: "넷플릭스",
      amount: 17_000n,
      dayOfMonth: 5,
      months: 4,
      lastDate: "2026-11-05",
      startDate: "2026-11-06",
      categoryId: "c-sub",
      fromAccountId: "card",
    });
  });

  it("2달뿐이거나 45일 넘게 끊겼으면 빼고, 날짜가 흩어져 있으면 뺀다", () => {
    expect(findRecurringCandidates(netflix.slice(2), opts())).toEqual([]);
    expect(findRecurringCandidates(netflix.slice(0, 3), opts({ today: "2026-12-01" }))).toEqual([]);
    const scattered = [tx("2026-08-02", 17_000), tx("2026-09-15", 17_000), tx("2026-10-25", 17_000)];
    expect(findRecurringCandidates(scattered, opts())).toEqual([]);
  });

  it("금액이 10% 안에서 오르면 최근 금액, 범위도 알려 준다", () => {
    const [c] = findRecurringCandidates([tx("2026-08-20", 55_000), tx("2026-09-20", 55_000), tx("2026-10-21", 58_300)], opts());
    expect(c.amount).toBe(58_300n);
    expect(c.minAmount).toBe(55_000n);
    expect(c.maxAmount).toBe(58_300n);
  });

  it("사용처가 같아도 들쭉날쭉한 장보기는 빼고 일정한 멤버십만 고른다", () => {
    const coupang = [
      tx("2026-08-12", 7_890, { merchant: "쿠팡" }),
      tx("2026-08-03", 32_100, { merchant: "쿠팡" }),
      tx("2026-09-12", 7_890, { merchant: "쿠팡" }),
      tx("2026-09-20", 15_400, { merchant: "쿠팡" }),
      tx("2026-10-13", 7_890, { merchant: "쿠팡" }),
      tx("2026-10-01", 51_000, { merchant: "쿠팡" }),
    ];
    const [c] = findRecurringCandidates(coupang, opts());
    expect(c.amount).toBe(7_890n);
    expect(c.dayOfMonth).toBe(12);
  });

  it("한 달에 여러 번 같은 금액(커피)이면 정기 결제가 아니다", () => {
    const coffee = ["08", "09", "10"].flatMap((m) => ["03", "04", "05"].map((d) => tx(`2026-${m}-${d}`, 4_500, { merchant: "스타벅스" })));
    expect(findRecurringCandidates(coffee, opts())).toEqual([]);
  });

  it("말일·초하루에 걸친 결제도 모인 것으로 본다", () => {
    const [c] = findRecurringCandidates([tx("2026-08-31", 9_900), tx("2026-10-01", 9_900), tx("2026-10-30", 9_900)], opts());
    expect(c.dayOfMonth).toBe(31);
  });

  it("이미 등록한 규칙·'아니에요'·규칙으로 생긴 기록·사용처 없는 기록은 뺀다", () => {
    const key = recurringCandidateKey("EXPENSE", "넷 플릭스");
    expect(findRecurringCandidates(netflix, opts({ ruleKeys: new Set([key]) }))).toEqual([]);
    expect(findRecurringCandidates(netflix, opts({ dismissed: new Set([key]) }))).toEqual([]);
    expect(findRecurringCandidates(netflix.map((t) => ({ ...t, recurringRuleId: "r" })), opts())).toEqual([]);
    expect(findRecurringCandidates(netflix.map((t) => ({ ...t, merchant: " " })), opts())).toEqual([]);
  });

  it("월급도 찾고, 수입이 먼저·큰 금액부터 나온다", () => {
    const salary = ["08", "09", "10"].map((m) => tx(`2026-${m}-25`, 3_000_000, { type: "INCOME", merchant: "회사", toAccountId: "bank", fromAccountId: null }));
    const phone = ["08", "09", "10"].map((m) => tx(`2026-${m}-21`, 60_000, { merchant: "SKT" }));
    const list = findRecurringCandidates([...netflix, ...phone, ...salary], opts());
    expect(list.map((c) => c.merchant)).toEqual(["회사", "SKT", "넷플릭스"]);
  });
});
