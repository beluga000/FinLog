import { describe, expect, it } from "vitest";
import { composeWeeklyNotice, isWeeklySummaryDay, summarizeWeek, weeklyRangeStart, type WeeklyExpense } from "../weekly-summary";

// 2026-11-16 은 월요일 — 지난주 11/9(월)~11/15(일), 비교 기준 10/12~11/8
const TODAY = "2026-11-16";
const food = { id: "food", name: "식비" };
const parentOf = new Map([
  ["food", food],
  ["eatout", food], // 식비 > 외식 (소분류)
  ["shop", { id: "shop", name: "쇼핑" }],
]);
const ex = (date: string, amount: number, categoryId: string | null = "food", isFixed = false): WeeklyExpense => ({
  date,
  amount: BigInt(amount),
  categoryId,
  isFixed,
});
/** 비교 기준 4주에 같은 금액 */
const baseWeeks = (amount: number, categoryId = "food") => ["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12"].map((d) => ex(d, amount, categoryId));

describe("주간 요약", () => {
  it("월요일에만 보낸다", () => {
    expect(isWeeklySummaryDay("2026-11-16")).toBe(true);
    expect(isWeeklySummaryDay("2026-11-15")).toBe(false);
    expect(isWeeklySummaryDay("2026-11-17")).toBe(false);
  });

  it("조회 범위는 지난주 + 비교 4주", () => {
    expect(weeklyRangeStart(TODAY)).toBe("2026-10-12");
  });

  it("지난주(월~일)만 합치고 오늘·그 전 주는 넣지 않는다", () => {
    const s = summarizeWeek({ today: TODAY, parentOf, expenses: [ex("2026-11-09", 10_000), ex("2026-11-15", 20_000), ex("2026-11-16", 99_000), ex("2026-11-08", 5_000)] });
    expect(s.total).toBe(30_000n);
  });

  it("고정 지출은 세지 않는다", () => {
    const s = summarizeWeek({ today: TODAY, parentOf, expenses: [ex("2026-11-10", 10_000), ex("2026-11-10", 700_000, "food", true)] });
    expect(s.total).toBe(10_000n);
  });

  it("평소 = 지출이 있었던 직전 주들의 평균 (빈 주는 빼고), 2주 미만이면 비교하지 않는다", () => {
    const one = summarizeWeek({ today: TODAY, parentOf, expenses: [ex("2026-11-10", 100_000), ex("2026-11-03", 50_000)] });
    expect(one.usual).toBeNull();
    const two = summarizeWeek({ today: TODAY, parentOf, expenses: [ex("2026-11-10", 100_000), ex("2026-11-03", 50_000), ex("2026-10-27", 70_000)] });
    expect(two.usual).toBe(60_000n);
  });

  it("소분류는 대분류로 묶어 가장 많이 늘어난 것을 짚는다", () => {
    const s = summarizeWeek({
      today: TODAY,
      parentOf,
      expenses: [...baseWeeks(50_000), ex("2026-11-10", 50_000), ex("2026-11-11", 40_000, "eatout"), ex("2026-11-12", 30_000, "shop")],
    });
    expect(s.rise).toEqual({ name: "식비", diff: 40_000n });
  });

  it("조금 늘었거나(2만 미만) 1.3배가 안 되면 짚지 않는다", () => {
    const small = summarizeWeek({ today: TODAY, parentOf, expenses: [...baseWeeks(50_000), ex("2026-11-10", 65_000)] });
    expect(small.rise).toBeNull();
    const big = summarizeWeek({ today: TODAY, parentOf, expenses: [...baseWeeks(200_000), ex("2026-11-10", 240_000)] });
    expect(big.rise).toBeNull();
  });

  it("알림 문구 — 더 썼을 때", () => {
    const n = composeWeeklyNotice({
      summary: { total: 320_000n, usual: 280_000n, rise: { name: "외식", diff: 40_000n } },
      spendable: { daily: 41_000n, remaining: 500_000n },
    });
    expect(n).toEqual({
      title: "지난주 32만 썼어요",
      body: "평소보다 4만 더 썼어요 · 외식 +4만 · 이번 주 하루 4.1만씩 쓸 수 있어요",
      url: "/ledger",
      tag: "weekly",
    });
  });

  it("비슷하거나 덜 썼을 때, 쓸 수 있는 돈을 넘었을 때", () => {
    const similar = composeWeeklyNotice({ summary: { total: 205_000n, usual: 200_000n, rise: null }, spendable: null });
    expect(similar?.body).toBe("평소와 비슷해요");
    const less = composeWeeklyNotice({ summary: { total: 100_000n, usual: 200_000n, rise: null }, spendable: { daily: 0n, remaining: -30_000n } });
    expect(less?.body).toBe("평소보다 10만 덜 썼어요 · 이번 달 쓸 수 있는 돈을 넘었어요");
  });

  it("지출도 비교할 주도 없으면 보내지 않는다", () => {
    expect(composeWeeklyNotice({ summary: { total: 0n, usual: null, rise: null }, spendable: null })).toBeNull();
    expect(composeWeeklyNotice({ summary: { total: 0n, usual: 50_000n, rise: null }, spendable: null })?.title).toBe("지난주엔 쓴 돈이 없어요");
  });
});
