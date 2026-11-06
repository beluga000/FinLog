import { describe, expect, it } from "vitest";
import { canHaveRule, findRule, guessByBrand, isNearAmount, merchantKey, resolveCategory } from "../merchant-rules";

const categories = [
  { id: "food", name: "식비", txType: "EXPENSE" },
  { id: "snack", name: "카페·간식", txType: "EXPENSE", parentId: "food" },
  { id: "delivery", name: "배달", txType: "EXPENSE", parentId: "food" },
  { id: "grocery", name: "장보기", txType: "EXPENSE", parentId: "food" },
  { id: "living", name: "생활용품", txType: "EXPENSE" },
  { id: "pharmacy", name: "병원·약국", txType: "EXPENSE" },
  { id: "salary", name: "배달", txType: "INCOME" },
];
const rule = (merchant: string, categoryId: string) => ({ merchant, merchantKey: merchantKey(merchant), categoryId });

describe("가맹점 규칙 찾기", () => {
  it("같은 이름은 공백·대소문자와 상관없이", () => {
    expect(findRule("탕화 콩푸 마라탕", [rule("탕화콩푸마라탕", "food")])?.categoryId).toBe("food");
    expect(findRule("starbucks", [rule("STARBUCKS", "snack")])?.categoryId).toBe("snack");
  });

  it("지점 이름이 붙어도 — 가장 긴 규칙, 영문이 이어지면 다른 가게", () => {
    const rules = [rule("GS25", "snack"), rule("GS25문정", "living")];
    expect(findRule("GS25문정현대A동점", rules)?.categoryId).toBe("living");
    expect(findRule("GS25잠실점", rules)?.categoryId).toBe("snack");
    expect(findRule("CUCKOO", [rule("CU", "snack")])).toBeNull();
  });

  it("네이버페이·쿠팡처럼 품목을 모르는 곳은 규칙을 만들지 않는다", () => {
    expect(canHaveRule("네이버페이")).toBe(false);
    expect(canHaveRule("쿠팡")).toBe(false);
    expect(canHaveRule(" ")).toBe(false);
    expect(canHaveRule("탕화콩푸마라탕")).toBe(true);
  });
});

describe("브랜드 사전", () => {
  it("편의점·배달·마트·약국", () => {
    expect(guessByBrand("GS25문정현대A동점", categories)).toBe("snack");
    expect(guessByBrand("배달의민족", categories)).toBe("delivery");
    expect(guessByBrand("이마트 문정점", categories)).toBe("grocery");
    expect(guessByBrand("이마트24 잠실점", categories)).toBe("snack");
    expect(guessByBrand("온누리약국", categories)).toBe("pharmacy");
  });

  it("가구에 없는 카테고리면 고르지 않는다", () => {
    expect(guessByBrand("CGV강남", categories)).toBeNull();
    expect(guessByBrand("탕화콩푸마라탕", categories)).toBeNull();
  });
});

describe("규칙 → 사전 순서", () => {
  it("규칙이 사전보다 먼저, 지워진 카테고리 규칙은 무시", () => {
    expect(resolveCategory("GS25잠실점", [rule("GS25", "living")], categories)).toMatchObject({ categoryId: "living", source: "rule" });
    expect(resolveCategory("GS25잠실점", [rule("GS25", "gone")], categories)).toMatchObject({ categoryId: "snack", source: "brand" });
    expect(resolveCategory("네이버페이", [rule("네이버페이", "food")], categories)).toBeNull();
  });
});

describe("거의 같은 금액", () => {
  it("3% 안", () => {
    expect(isNearAmount(10_000n, 10_100n)).toBe(true);
    expect(isNearAmount(10_000n, 10_400n)).toBe(false);
    expect(isNearAmount(0n, 100n)).toBe(false);
  });
});
