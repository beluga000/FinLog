import { describe, expect, it } from "vitest";
import type { CaptureItem } from "../card-capture";
import { captureItemKey, importKeys, matchIssuerAccount, mergeCaptureResults, mergeRejected } from "../capture-import";

const item = (date: string, merchant: string, amount: number, extra: Partial<CaptureItem> = {}): CaptureItem => ({
  date,
  merchant,
  amount: BigInt(amount),
  status: "approved",
  installment: 1,
  confidence: 90,
  lines: [],
  ...extra,
});

describe("캡처 여러 장 합치기", () => {
  it("겹쳐 찍은 캡처의 같은 건은 한 번만 남긴다", () => {
    const merged = mergeCaptureResults([
      { issuer: "신한카드", items: [item("2026-11-03", "스타벅스 역삼점", 4800), item("2026-11-02", "GS25역삼점", 2500)] },
      { issuer: "신한카드", items: [item("2026-11-02", "GS25 역삼점", 2500), item("2026-11-01", "쿠팡", 32000)] },
    ]);
    expect(merged.map((m) => m.amount)).toEqual([4800n, 2500n, 32000n]);
    expect(merged.every((m) => m.issuer === "신한카드")).toBe(true);
  });

  it("한 장 안에 똑같은 두 건은 실제로 두 번 쓴 것 — 둘 다 남기고, 다음 장에 또 나와도 늘리지 않는다", () => {
    const merged = mergeCaptureResults([
      { issuer: null, items: [item("2026-11-03", "메가커피", 2000), item("2026-11-03", "메가커피", 2000)] },
      { issuer: null, items: [item("2026-11-03", "메가커피", 2000)] },
      { issuer: null, items: [item("2026-11-03", "메가커피", 2000), item("2026-11-03", "메가커피", 2000), item("2026-11-03", "메가커피", 2000)] },
    ]);
    expect(merged).toHaveLength(3);
  });

  it("승인과 취소, 날짜·금액이 다르면 다른 건이다", () => {
    const merged = mergeCaptureResults([
      { issuer: null, items: [item("2026-11-03", "쿠팡", 1000), item("2026-11-03", "쿠팡", 1000, { status: "canceled" })] },
      { issuer: null, items: [item("2026-11-02", "쿠팡", 1000), item("2026-11-03", "쿠팡", 1001)] },
    ]);
    expect(merged).toHaveLength(4);
  });

  it("카드사는 그 건이 나온 캡처를 따른다", () => {
    const merged = mergeCaptureResults([
      { issuer: "현대카드", items: [item("2026-11-03", "A", 1000)] },
      { issuer: "KB국민카드", items: [item("2026-11-03", "B", 1000)] },
    ]);
    expect(merged.map((m) => m.issuer)).toEqual(["현대카드", "KB국민카드"]);
  });

  it("열쇠는 가맹점 공백·대소문자를 무시한다", () => {
    expect(captureItemKey(item("2026-11-01", "GS25 역삼점", 1))).toBe(captureItemKey(item("2026-11-01", "gs25역삼점", 1)));
  });

  it("등록 안 한 건도 겹치면 한 번만", () => {
    const x = { item: item("2026-11-01", "A", 1000), reasons: ["할부 정보 없음"], index: 0 };
    expect(mergeRejected([{ rejected: [x] }, { rejected: [{ ...x, index: 3 }] }])).toHaveLength(1);
  });
});

describe("가져오기 중복 방지 열쇠", () => {
  it("같은 내용은 같은 열쇠 — 다시 가져와도 건너뛸 수 있다", () => {
    const rows = [{ date: "2026-11-03", amount: 4800n, merchant: "스타벅스", accountId: "acc1" }];
    expect(importKeys("h1", rows)).toEqual(importKeys("h1", rows));
    expect(importKeys("h1", rows)[0]).toBe("h1|2026-11-03|4800|스타벅스|acc1|0");
  });

  it("한 번에 저장하는 똑같은 건은 순번으로 구분한다", () => {
    const r = { date: "2026-11-03", amount: "2000", merchant: "메가커피", accountId: "acc1" };
    const keys = importKeys("h1", [r, { ...r, merchant: "빽다방" }, r, r]);
    expect(keys.map((k) => k.split("|").pop())).toEqual(["0", "0", "1", "2"]);
    expect(new Set(keys).size).toBe(4);
  });

  it("가구·계좌가 다르면 다른 열쇠", () => {
    const r = { date: "2026-11-03", amount: 1n, merchant: null, accountId: "a" };
    expect(importKeys("h1", [r])[0]).not.toBe(importKeys("h2", [r])[0]);
    expect(importKeys("h1", [r])[0]).not.toBe(importKeys("h1", [{ ...r, accountId: "b" }])[0]);
  });
});

describe("카드사 → 결제 수단", () => {
  const accounts = [
    { id: "cash", name: "현금", type: "CASH" as const, institution: null },
    { id: "shinhan-bank", name: "월급통장", type: "CHECKING" as const, institution: "신한은행" },
    { id: "shinhan-card", name: "Deep Dream", type: "CREDIT_CARD" as const, institution: "신한카드" },
    { id: "kb", name: "KB국민 체크", type: "CHECKING" as const, institution: null },
    { id: "loan", name: "현대 대출", type: "LOAN" as const, institution: "현대카드" },
  ];

  it("금융사가 같은 계좌를 먼저 고른다", () => {
    expect(matchIssuerAccount("신한카드", accounts)).toBe("shinhan-card");
  });

  it("금융사가 없으면 이름에 카드사명이 들어간 계좌", () => {
    expect(matchIssuerAccount("KB국민카드", accounts)).toBe("kb");
  });

  it("대출 계좌·모르는 카드사는 고르지 않는다", () => {
    expect(matchIssuerAccount("현대카드", accounts)).toBeNull();
    expect(matchIssuerAccount("롯데카드", accounts)).toBeNull();
    expect(matchIssuerAccount(null, accounts)).toBeNull();
  });

  it("같은 점수면 신용카드", () => {
    expect(
      matchIssuerAccount("하나카드", [
        { id: "chk", name: "x", type: "CHECKING", institution: "하나은행" },
        { id: "cc", name: "y", type: "CREDIT_CARD", institution: "하나카드사" },
      ]),
    ).toBe("cc");
  });
});
