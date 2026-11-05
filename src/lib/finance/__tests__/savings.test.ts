import { describe, expect, it } from "vitest";
import { estimateMaturity, remainingDeposits, termProgress, type FixedDeposit } from "../savings";

const deposit = (p: Partial<FixedDeposit> = {}): FixedDeposit => ({
  amount: 500_000n,
  schedule: { dayOfMonth: 10, businessDayAdjust: "NONE", startDate: "2026-01-10", endDate: null },
  lastRunOn: "2026-10-10",
  ...p,
});

describe("남은 납입 횟수", () => {
  it("오늘 이후 ~ 만기 전날까지 (만기일 당일 회차는 넣지 않는다)", () => {
    expect(remainingDeposits(deposit(), "2026-11-03", "2027-01-10")).toBe(2);
    expect(remainingDeposits(deposit(), "2026-11-03", "2027-01-11")).toBe(3);
  });

  it("규칙 종료일이 만기보다 빠르면 종료일까지만, 만기가 지났으면 0", () => {
    const ending = deposit({ schedule: { ...deposit().schedule, endDate: "2026-11-30" } });
    expect(remainingDeposits(ending, "2026-11-03", "2027-01-10")).toBe(1);
    expect(remainingDeposits(deposit(), "2027-02-01", "2027-01-10")).toBe(0);
  });
});

describe("만기 예상액", () => {
  it("적금: 월 50만 · 연 3.6% · 12개월 → 이자 117,000, 세금 15.4%", () => {
    const e = estimateMaturity({
      balance: 5_000_000n,
      deposits: [deposit()],
      annualRate: 0.036,
      openedOn: "2026-01-10",
      maturityDate: "2027-01-10",
      today: "2026-11-03",
    });
    expect(e.kind).toBe("installment");
    expect(e.remainingCount).toBe(2);
    expect(e.principal).toBe(6_000_000n);
    expect(e.interest).toBe(117_000n);
    expect(e.tax).toBe(18_018n);
    expect(e.afterTax).toBe(6_098_982n);
  });

  it("가입일을 모르면 만기 원금 ÷ 월 납입액으로 납입 개월 수를 추정", () => {
    const e = estimateMaturity({
      balance: 5_000_000n,
      deposits: [deposit()],
      annualRate: 0.036,
      openedOn: null,
      maturityDate: "2027-01-10",
      today: "2026-11-03",
    });
    expect(e.interest).toBe(117_000n);
  });

  it("적금 + 목돈: 월 납입으로 설명되지 않는 원금은 예금처럼 이자를 더한다", () => {
    // 1,325만 잔액 + 남은 2회 = 1,425만, 월 납입분 12×50만 = 600만 → 목돈 825만 × 3.6% × 12개월 = 297,000
    const e = estimateMaturity({
      balance: 13_250_000n,
      deposits: [deposit()],
      annualRate: 0.036,
      openedOn: "2026-01-10",
      maturityDate: "2027-01-10",
      today: "2026-11-03",
    });
    expect(e.principal).toBe(14_250_000n);
    expect(e.interest).toBe(117_000n + 297_000n);
  });

  it("예금: 정기 저축 없이 1,000만 · 연 3% · 12개월 → 세후 10,253,800", () => {
    const e = estimateMaturity({
      balance: 10_000_000n,
      deposits: [],
      annualRate: 0.03,
      openedOn: "2026-05-01",
      maturityDate: "2027-05-01",
      today: "2026-11-03",
    });
    expect(e.kind).toBe("deposit");
    expect(e.interest).toBe(300_000n);
    expect(e.afterTax).toBe(10_253_800n);
  });

  it("금리를 모르면 이자 0, 원금만", () => {
    const e = estimateMaturity({ balance: 1_000n, deposits: [], annualRate: null, openedOn: null, maturityDate: "2027-01-01", today: "2026-11-03" });
    expect(e).toMatchObject({ principal: 1_000n, interest: 0n, afterTax: 1_000n });
  });
});

describe("기간 진행률", () => {
  it("가입일~만기일 사이 비율, 범위 밖은 0·1로 자르고 모르면 null", () => {
    expect(termProgress("2026-01-01", "2026-01-11", "2026-01-06")).toBeCloseTo(0.5);
    expect(termProgress("2026-01-01", "2026-01-11", "2027-01-01")).toBe(1);
    expect(termProgress(null, "2026-01-11", "2026-01-06")).toBeNull();
  });
});

describe("정책형 적금 (비과세 + 정부기여금)", () => {
  it("비과세면 세금 0, 기여금은 월 기여금 × 가입 개월 수로 더한다", () => {
    const e = estimateMaturity({
      balance: 5_000_000n,
      deposits: [deposit()],
      annualRate: 0.036,
      openedOn: "2026-01-10",
      maturityDate: "2027-01-10",
      today: "2026-11-03",
      taxFree: true,
      monthlyContribution: 30_000,
    });
    expect(e.interest).toBe(117_000n);
    expect(e.tax).toBe(0n);
    expect(e.contribution).toBe(360_000n);
    expect(e.afterTax).toBe(6_477_000n);
  });

  it("월 납입 없는 예금이면 기여금 0", () => {
    const e = estimateMaturity({
      balance: 1_000_000n,
      deposits: [],
      annualRate: 0.03,
      openedOn: "2026-01-01",
      maturityDate: "2027-01-01",
      today: "2026-11-03",
      monthlyContribution: 30_000,
    });
    expect(e.contribution).toBe(0n);
  });
});
