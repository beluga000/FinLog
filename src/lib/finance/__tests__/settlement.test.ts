import { describe, expect, it } from "vitest";
import { computeSettlement } from "../settlement";

const members: [string, string] = ["a", "b"];

describe("부부 정산", () => {
  it("반반: 더 낸 사람에게 차액의 절반을 보낸다", () => {
    const r = computeSettlement({
      members,
      method: "EQUAL",
      expenses: [
        { amount: 300_000n, payerId: "a" },
        { amount: 100_000n, payerId: "b" },
      ],
    });
    expect(r.total).toBe(400_000n);
    expect(r.share).toEqual({ a: 200_000n, b: 200_000n });
    expect(r.transfer).toEqual({ from: "b", to: "a", amount: 100_000n });
  });

  it("공동 명의 계좌로 낸 지출은 정산에서 뺀다", () => {
    const r = computeSettlement({
      members,
      method: "EQUAL",
      expenses: [
        { amount: 500_000n, payerId: null },
        { amount: 100_000n, payerId: "b" },
      ],
    });
    expect(r.jointPaid).toBe(500_000n);
    expect(r.total).toBe(100_000n);
    expect(r.transfer).toEqual({ from: "a", to: "b", amount: 50_000n });
  });

  it("똑같이 냈으면 보낼 돈이 없다", () => {
    const r = computeSettlement({ members, method: "EQUAL", expenses: [{ amount: 1n, payerId: "a" }, { amount: 1n, payerId: "b" }] });
    expect(r.transfer).toBeNull();
  });

  it("수입 비율: 6:4 이면 공동 지출도 6:4", () => {
    const r = computeSettlement({
      members,
      method: "INCOME_RATIO",
      incomes: { a: 6_000_000n, b: 4_000_000n },
      expenses: [{ amount: 1_000_000n, payerId: "b" }],
    });
    expect(r.basisPointsA).toBe(6000);
    expect(r.share).toEqual({ a: 600_000n, b: 400_000n });
    expect(r.transfer).toEqual({ from: "a", to: "b", amount: 600_000n });
  });

  it("수입 비율인데 수입 기록이 없으면 반반으로 계산하고 알려 준다", () => {
    const r = computeSettlement({ members, method: "INCOME_RATIO", incomes: {}, expenses: [{ amount: 100n, payerId: "a" }] });
    expect(r.incomeFallback).toBe(true);
    expect(r.basisPointsA).toBe(5000);
  });

  it("직접 정한 비율 70%", () => {
    const r = computeSettlement({ members, method: "CUSTOM", customPercentA: 70, expenses: [{ amount: 100_000n, payerId: "a" }] });
    expect(r.share).toEqual({ a: 70_000n, b: 30_000n });
    expect(r.transfer).toEqual({ from: "b", to: "a", amount: 30_000n });
  });

  it("나누어떨어지지 않아도 두 몫의 합은 공동 지출과 같다 (원 단위 반올림)", () => {
    const r = computeSettlement({
      members,
      method: "INCOME_RATIO",
      incomes: { a: 1n, b: 2n },
      expenses: [{ amount: 100_001n, payerId: "a" }],
    });
    expect(r.share.a + r.share.b).toBe(100_001n);
    expect(r.basisPointsA).toBe(3333);
  });
});
