import { describe, expect, it } from "vitest";
import {
  calculateMonthsToGoal,
  calculateRequiredInvestment,
  futureValue,
  predictAssetGrowth,
  suggestAlternatives,
  toMonthlyRate,
} from "../projection";

describe("toMonthlyRate", () => {
  it("연 수익률을 복리 기준 월 수익률로 환산한다", () => {
    expect(Math.pow(1 + toMonthlyRate(0.06), 12)).toBeCloseTo(1.06, 12);
    expect(toMonthlyRate(0)).toBe(0);
  });
});

describe("predictAssetGrowth — PROD.MD §4 기준값 (AC-6)", () => {
  it("PV 0, 월 100만, 0%, 10년 → 1.2억", () => {
    const r = predictAssetGrowth({ pv: 0, pmt: 1_000_000, annualReturn: 0, years: 10, inflation: 0 });
    expect(r.finalBalance).toBe(120_000_000);
    expect(r.totalContributed).toBe(120_000_000);
    expect(r.points).toHaveLength(11);
  });

  it("PV 1천만, 납입 0, 5%, 10년 → 16,288,946", () => {
    const r = predictAssetGrowth({ pv: 10_000_000, pmt: 0, annualReturn: 0.05, years: 10 });
    expect(r.finalBalance).toBe(16_288_946);
  });

  it("닫힌 식 FV 와 반복 계산 결과가 ±1원 이내로 일치한다", () => {
    const r = predictAssetGrowth({ pv: 50_000_000, pmt: 1_500_000, annualReturn: 0.07, years: 20 });
    const closed = futureValue(50_000_000, 1_500_000, toMonthlyRate(0.07), 240);
    expect(Math.abs(r.finalBalance - closed)).toBeLessThanOrEqual(1);
  });

  it("실질가치는 물가상승률로 할인된다", () => {
    const r = predictAssetGrowth({ pv: 100_000_000, pmt: 0, annualReturn: 0, years: 10, inflation: 0.025 });
    expect(r.finalBalanceReal).toBe(Math.round(100_000_000 / Math.pow(1.025, 10)));
  });

  it("납입액 증가율을 매년 반영한다", () => {
    const r = predictAssetGrowth({ pv: 0, pmt: 100, annualReturn: 0, years: 2, pmtGrowth: 0.1, inflation: 0 });
    expect(r.finalBalance).toBe(100 * 12 + 110 * 12);
  });

  it("음수 수익률도 계산한다", () => {
    const r = predictAssetGrowth({ pv: 1_000_000, pmt: 0, annualReturn: -0.1, years: 1 });
    expect(r.finalBalance).toBe(900_000);
    expect(r.cumulativeReturn).toBeCloseTo(-0.1, 6);
  });

  it("0년이면 현재 자산만 반환", () => {
    const r = predictAssetGrowth({ pv: 5, pmt: 100, annualReturn: 0.05, years: 0 });
    expect(r.finalBalance).toBe(5);
    expect(r.points).toHaveLength(1);
  });

  it("원금 0이면 누적 수익률은 null", () => {
    expect(predictAssetGrowth({ pv: 0, pmt: 0, annualReturn: 0.05, years: 3 }).cumulativeReturn).toBeNull();
  });
});

describe("calculateRequiredInvestment (AC-7)", () => {
  it("목표 10억, 현재 1억, 6%, 15년 → 월 2,650,097원 (올림)", () => {
    const r = calculateRequiredInvestment({ target: 1_000_000_000, pv: 100_000_000, months: 180, annualReturn: 0.06 });
    expect(r.alreadyAchievable).toBe(false);
    expect(r.monthly).toBe(2_650_097);
  });

  it("역산한 납입액으로 FV를 다시 계산하면 목표에 도달한다", () => {
    const r = calculateRequiredInvestment({ target: 300_000_000, pv: 20_000_000, months: 84, annualReturn: 0.045 });
    expect(futureValue(20_000_000, r.monthly, toMonthlyRate(0.045), 84)).toBeGreaterThanOrEqual(300_000_000);
    expect(futureValue(20_000_000, r.monthly - 1, toMonthlyRate(0.045), 84)).toBeLessThan(300_000_000);
  });

  it("현재 자산만으로 달성 가능하면 0 + alreadyAchievable", () => {
    const r = calculateRequiredInvestment({ target: 100, pv: 100, months: 12, annualReturn: 0.05 });
    expect(r).toMatchObject({ monthly: 0, alreadyAchievable: true });
  });

  it("수익률 0%면 단순 나눗셈", () => {
    expect(calculateRequiredInvestment({ target: 1200, pv: 0, months: 12, annualReturn: 0 }).monthly).toBe(100);
  });

  it("기간 1개월", () => {
    expect(calculateRequiredInvestment({ target: 1000, pv: 0, months: 1, annualReturn: 0.05 }).monthly).toBe(1000);
  });

  it("기간 0개월이면 부족분 전체", () => {
    expect(calculateRequiredInvestment({ target: 1000, pv: 400, months: 0, annualReturn: 0.05 }).monthly).toBe(600);
  });

  it("실질 목표는 목표 시점 명목가로 환산한다", () => {
    const r = calculateRequiredInvestment({
      target: 1200, pv: 0, months: 12, annualReturn: 0, targetIsReal: true, inflation: 0.1,
    });
    expect(r.nominalTarget).toBeCloseTo(1320, 6);
    expect(r.monthly).toBe(110);
  });
});

describe("calculateMonthsToGoal", () => {
  it("이미 도달했으면 0", () => {
    expect(calculateMonthsToGoal({ target: 100, pv: 100, pmt: 0, annualReturn: 0 })).toBe(0);
  });
  it("0% 단순 누적", () => {
    expect(calculateMonthsToGoal({ target: 1000, pv: 0, pmt: 100, annualReturn: 0 })).toBe(10);
  });
  it("닫힌 식 n = log((T·r+P)/(PV·r+P))/log(1+r) 과 일치 (올림)", () => {
    const r = toMonthlyRate(0.06);
    const T = 500_000_000, PV = 30_000_000, P = 2_000_000;
    const n = Math.log((T * r + P) / (PV * r + P)) / Math.log(1 + r);
    expect(calculateMonthsToGoal({ target: T, pv: PV, pmt: P, annualReturn: 0.06 })).toBe(Math.ceil(n));
  });
  it("도달 불가능하면 null", () => {
    expect(calculateMonthsToGoal({ target: 1000, pv: 0, pmt: 0, annualReturn: 0 })).toBeNull();
    expect(calculateMonthsToGoal({ target: 1000, pv: 100, pmt: 0, annualReturn: -0.05 })).toBeNull();
  });
});

describe("suggestAlternatives", () => {
  it("저축 가능액 부족 시 기간연장·목표하향·수익률상향 대안을 준다", () => {
    const alt = suggestAlternatives({
      target: 120_000, pv: 0, months: 12, annualReturn: 0, capacity: 5_000, higherReturn: 0.1,
    });
    expect(alt.extendToMonths).toBe(24);
    expect(alt.reachableTarget).toBe(60_000);
    expect(alt.higherReturn?.monthly).toBeLessThan(10_000);
  });
  it("더 높은 수익률이 없으면 (c) 대안 없음", () => {
    const alt = suggestAlternatives({ target: 100, pv: 0, months: 12, annualReturn: 0.1, capacity: 1, higherReturn: 0.05 });
    expect(alt.higherReturn).toBeNull();
  });
  it("실질 목표의 도달 가능액은 오늘 가치로 표시", () => {
    const alt = suggestAlternatives({
      target: 1, pv: 1100, months: 12, annualReturn: 0, capacity: 0, targetIsReal: true, inflation: 0.1,
    });
    expect(alt.reachableTarget).toBe(1000);
  });
});
