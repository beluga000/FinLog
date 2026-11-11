import { describe, expect, it } from "vitest";
import { matchesTxQuery, parseTxQuery } from "../tx-search";

const tx = { merchant: "스타벅스 잠실점", memo: "회의 커피", categoryName: "카페", amount: 17_000n };

describe("가계부 검색어", () => {
  it("빈 검색어는 없음, 숫자(쉼표·원)는 금액으로도 읽는다", () => {
    expect(parseTxQuery("  ")).toBeNull();
    expect(parseTxQuery("17,000원")).toEqual({ text: "17,000원", amount: 17_000n });
    expect(parseTxQuery("스벅")).toEqual({ text: "스벅", amount: null });
    expect(parseTxQuery("0")?.amount).toBeNull();
  });

  it("사용처·메모·카테고리를 공백·대소문자 무시하고 찾는다", () => {
    expect(matchesTxQuery(tx, parseTxQuery("스타벅스잠실")!)).toBe(true);
    expect(matchesTxQuery(tx, parseTxQuery("회의")!)).toBe(true);
    expect(matchesTxQuery(tx, parseTxQuery("카페")!)).toBe(true);
    expect(matchesTxQuery({ ...tx, merchant: "Netflix" }, parseTxQuery("netflix")!)).toBe(true);
    expect(matchesTxQuery(tx, parseTxQuery("투썸")!)).toBe(false);
  });

  it("금액이 같으면 찾고, 다르면 글자로만 본다", () => {
    expect(matchesTxQuery(tx, parseTxQuery("17000")!)).toBe(true);
    expect(matchesTxQuery(tx, parseTxQuery("18,000")!)).toBe(false);
    expect(matchesTxQuery({ ...tx, memo: "2025 연말정산" }, parseTxQuery("2025")!)).toBe(true);
  });
});
