import { describe, expect, it } from "vitest";
import { monthlyContribution, productRule, SAVINGS_PRODUCTS } from "../savings-products";

const leap = SAVINGS_PRODUCTS.YOUTH_LEAP;
const future = SAVINGS_PRODUCTS.YOUTH_FUTURE;
const tier = (p: typeof leap, key: string) => p.tiers.find((t) => t.key === key)!;

describe("월 정부기여금", () => {
  it("청년도약계좌: 매칭 한도까지 구간 비율, 초과분 ~ 70만원은 3%", () => {
    const low = tier(leap, "2400");
    expect(monthlyContribution(low, leap.monthlyMax, 300_000)).toBe(18_000);
    expect(monthlyContribution(low, leap.monthlyMax, 700_000)).toBe(33_000);
    // 월 한도를 넘게 넣어도 70만원까지만
    expect(monthlyContribution(low, leap.monthlyMax, 900_000)).toBe(33_000);
    expect(monthlyContribution(tier(leap, "7500"), leap.monthlyMax, 700_000)).toBe(0);
  });

  it("청년미래적금: 50만원까지 일반 6% · 우대 12%", () => {
    expect(monthlyContribution(tier(future, "BASIC"), future.monthlyMax, 500_000)).toBe(30_000);
    expect(monthlyContribution(tier(future, "PREFERRED"), future.monthlyMax, 600_000)).toBe(60_000);
  });
});

describe("상품 규칙 찾기", () => {
  it("모르는 상품은 null, 모르는 구간은 tier null", () => {
    expect(productRule(null, null)).toBeNull();
    expect(productRule("ETC", "x")).toBeNull();
    expect(productRule("YOUTH_FUTURE", "x")?.tier).toBeNull();
    expect(productRule("YOUTH_FUTURE", "BASIC")?.product.label).toBe("청년미래적금");
  });
});

describe("청년미래적금 기여금 미대상 구간", () => {
  it("비과세만, 기여금 0", () => {
    expect(monthlyContribution(tier(future, "NONE"), future.monthlyMax, 500_000)).toBe(0);
    expect(future.taxFree).toBe(true);
  });
});
