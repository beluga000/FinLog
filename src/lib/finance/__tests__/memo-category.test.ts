import { describe, expect, it } from "vitest";
import { guessByMemo, memoKey, resolveCategory } from "../merchant-rules";

const categories = [
  { id: "food", name: "식비", txType: "EXPENSE" },
  { id: "grocery", name: "장보기", txType: "EXPENSE", parentId: "food" },
  { id: "snack", name: "카페·간식", txType: "EXPENSE", parentId: "food" },
  { id: "living", name: "생활용품", txType: "EXPENSE" },
  { id: "baby", name: "육아", txType: "EXPENSE" },
  { id: "pet", name: "반려동물", txType: "EXPENSE" },
  { id: "bonus", name: "상여", txType: "INCOME" },
];

describe("메모로 카테고리 (네이버페이·쿠팡)", () => {
  it("캡처가 붙인 할부 표시는 메모 키에서 뗀다", () => {
    expect(memoKey("에어팟 케이스 · 3개월 할부")).toBe(memoKey("에어팟케이스"));
  });

  it("가구에 같은 메모가 있으면 그 카테고리, 메모 안에 지난 메모가 들어 있어도", () => {
    const hints = [{ memoKey: memoKey("고양이 모래"), categoryId: "pet" }, { memoKey: memoKey("휴지"), categoryId: "grocery" }];
    expect(guessByMemo("고양이모래", hints, categories)).toBe("pet");
    expect(guessByMemo("휴지 30롤", hints, categories)).toBe("grocery"); // 사전(생활용품)보다 가구 기록이 먼저
  });

  it("지난 메모가 없으면 브랜드 → 품목 낱말 사전", () => {
    expect(guessByMemo("스타벅스 기프티콘", [], categories)).toBe("snack");
    expect(guessByMemo("샴푸 리필", [], categories)).toBe("living");
    expect(guessByMemo("하기스 기저귀", [], categories)).toBe("baby");
    expect(guessByMemo("삼다수 생수 2L", [], categories)).toBe("grocery");
  });

  it("모르는 메모·한 글자·없는 카테고리·수입 카테고리는 고르지 않는다", () => {
    expect(guessByMemo("선물", [], categories)).toBeNull();
    expect(guessByMemo("a", [], categories)).toBeNull();
    expect(guessByMemo("영화 티켓", [], categories)).toBeNull(); // 공연·영화 카테고리가 없는 가구
    expect(guessByMemo("보너스", [{ memoKey: memoKey("보너스"), categoryId: "bonus" }], categories)).toBeNull();
  });

  it("resolveCategory: 간편결제·쇼핑몰만 메모를 보고, 일반 가맹점은 메모를 보지 않는다", () => {
    const memo = { memo: "샴푸", hints: [] };
    expect(resolveCategory("네이버페이", [], categories, memo)).toEqual({ categoryId: "living", source: "memo" });
    expect(resolveCategory("네이버페이", [], categories)).toBeNull();
    expect(resolveCategory("스타벅스", [], categories, memo)?.source).toBe("brand");
  });
});
