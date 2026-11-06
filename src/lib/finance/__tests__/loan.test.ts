import { describe, expect, it } from "vitest";
import { loanPlan, remainingPaymentDates } from "../loan";

// 1,000만원 · 연 4.8% (월 0.4%) · 오늘 2026-11-06 · 매달 25일 · 2027-10-25 만기 → 남은 12회
const base = { balance: 10_000_000n, annualRate: 0.048, payDay: 25, maturityDate: "2027-10-25" } as const;
const today = "2026-11-06";

describe("남은 납입일", () => {
  it("오늘 이후 납입일부터 만기일까지", () => {
    const dates = remainingPaymentDates(25, "2027-10-25", today);
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe("2026-11-25");
    expect(dates.at(-1)).toBe("2027-10-25");
  });

  it("오늘이 납입일이면 오늘도 센다", () => {
    expect(remainingPaymentDates(6, "2027-01-06", today)).toEqual(["2026-11-06", "2026-12-06", "2027-01-06"]);
  });

  it("만기일이 납입일과 어긋나면 마지막 상환은 만기일", () => {
    expect(remainingPaymentDates(25, "2027-01-10", today)).toEqual(["2026-11-25", "2026-12-25", "2027-01-10"]);
  });

  it("납입일을 모르면 만기일의 날짜, 31일은 짧은 달 말일", () => {
    expect(remainingPaymentDates(null, "2027-01-20", today)).toEqual(["2026-11-20", "2026-12-20", "2027-01-20"]);
    expect(remainingPaymentDates(31, "2027-03-31", "2027-02-01")).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("만기가 지났으면 없다", () => {
    expect(remainingPaymentDates(25, "2026-10-25", today)).toEqual([]);
  });
});

describe("대출 상환 계산", () => {
  it("원리금균등: 매달 같은 금액, 이자는 남은 원금 × 월 금리", () => {
    const p = loanPlan({ ...base, repayment: "EQUAL_PAYMENT" }, today)!;
    expect(p.next).toEqual({ date: "2026-11-25", principal: 815_159n, interest: 40_000n, total: 855_159n });
    expect(p.remainingCount).toBe(12);
    expect(p.totalInterest).toBe(261_903n);
  });

  it("원금균등: 원금은 똑같이 나누고 이자 합계 = r·P·(n+1)/2", () => {
    const p = loanPlan({ ...base, repayment: "EQUAL_PRINCIPAL" }, today)!;
    expect(p.next).toEqual({ date: "2026-11-25", principal: 833_333n, interest: 40_000n, total: 873_333n });
    expect(p.totalInterest).toBe(260_000n);
  });

  it("만기일시: 매달 이자만, 마지막 회차에 원금 전부", () => {
    const p = loanPlan({ ...base, repayment: "BULLET" }, today)!;
    expect(p.next).toEqual({ date: "2026-11-25", principal: 0n, interest: 40_000n, total: 40_000n });
    expect(p.totalInterest).toBe(480_000n);
    const lastMonth = loanPlan({ ...base, repayment: "BULLET" }, "2027-10-01")!;
    expect(lastMonth.next).toMatchObject({ principal: 10_000_000n, total: 10_040_000n });
    expect(lastMonth.remainingCount).toBe(1);
  });

  it("마지막 회차는 남은 원금을 전부 갚는다 (반올림 오차 정리)", () => {
    const p = loanPlan({ ...base, balance: 1_000_001n, repayment: "EQUAL_PAYMENT" }, "2027-10-01")!;
    expect(p.next.principal).toBe(1_000_001n);
  });

  it("금리 0%면 원금만 나눠 낸다", () => {
    const p = loanPlan({ ...base, annualRate: 0, repayment: "EQUAL_PAYMENT" }, today)!;
    expect(p.next).toMatchObject({ principal: 833_333n, interest: 0n });
    expect(p.totalInterest).toBe(0n);
  });

  it("만기일을 모르면 만기일시만 매달 이자를 계산한다", () => {
    expect(loanPlan({ ...base, maturityDate: null, repayment: "BULLET" }, today)).toEqual({
      next: { date: null, principal: 0n, interest: 40_000n, total: 40_000n },
      remainingCount: null,
      totalInterest: null,
    });
    expect(loanPlan({ ...base, maturityDate: null, repayment: "EQUAL_PAYMENT" }, today)).toBeNull();
  });

  it("다 갚았거나 만기가 지났으면 계산하지 않는다", () => {
    expect(loanPlan({ ...base, balance: 0n, repayment: "EQUAL_PAYMENT" }, today)).toBeNull();
    expect(loanPlan({ ...base, maturityDate: "2026-10-25", repayment: "EQUAL_PAYMENT" }, today)).toBeNull();
  });
});
