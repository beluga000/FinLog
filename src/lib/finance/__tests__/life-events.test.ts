import { describe, expect, it } from "vitest";
import { monthAfter, projectWithEvents, savingDeltaIn, type LifeEventInput } from "../life-events";

const ev = (p: Partial<LifeEventInput>): LifeEventInput => ({
  id: "e",
  kind: "OTHER",
  label: "",
  startMonth: "2027-03",
  monthly: 0,
  months: null,
  oneTime: 0,
  ...p,
});

describe("생활 변화", () => {
  it("monthAfter: 오늘이 속한 달에서 n개월 뒤 (해 넘김 포함)", () => {
    expect(monthAfter("2026-11-12", 0)).toBe("2026-11");
    expect(monthAfter("2026-11-12", 2)).toBe("2027-01");
    expect(monthAfter("2026-11-12", 14)).toBe("2028-01");
  });

  it("기간이 있는 매달 변화는 그 기간만, 한 번 나가는 돈은 시작 달만", () => {
    const leave = ev({ monthly: -1_000_000, months: 12, oneTime: 2_000_000 });
    expect(savingDeltaIn([leave], "2027-02")).toBe(0);
    expect(savingDeltaIn([leave], "2027-03")).toBe(-3_000_000);
    expect(savingDeltaIn([leave], "2028-02")).toBe(-1_000_000);
    expect(savingDeltaIn([leave], "2028-03")).toBe(0);
  });

  it("계속되는 변화와 여러 일이 겹치면 더한다", () => {
    const events = [ev({ monthly: -500_000 }), ev({ startMonth: "2027-06", monthly: 300_000 })];
    expect(savingDeltaIn(events, "2030-01")).toBe(-200_000);
  });

  it("변화가 없으면 수익률 0에서 단순 적립과 같다", () => {
    const p = projectWithEvents({ current: 0, monthly: 1_000_000, annualReturn: 0, events: [], today: "2026-11-12", target: 12_000_000, targetIsReal: false, inflation: 0 });
    expect(p.months).toBe(12);
  });

  it("휴직 1년 동안 저축이 0이 되면 1년 늦어진다", () => {
    const base = { current: 0, monthly: 1_000_000, annualReturn: 0, today: "2026-11-12", target: 24_000_000, targetIsReal: false, inflation: 0 } as const;
    const without = projectWithEvents({ ...base, events: [] });
    const withLeave = projectWithEvents({ ...base, events: [ev({ startMonth: "2027-01", monthly: -1_000_000, months: 12 })] });
    expect(without.months).toBe(24);
    expect(withLeave.months).toBe(36);
  });

  it("한 번 나가는 돈이 모은 돈보다 크면 잔액이 마이너스가 될 수 있다", () => {
    const p = projectWithEvents({
      current: 1_000_000,
      monthly: 0,
      annualReturn: 0,
      events: [ev({ startMonth: "2026-12", oneTime: 3_000_000 })],
      today: "2026-11-12",
      target: 10_000_000,
      targetIsReal: false,
      inflation: 0,
      horizon: 3,
    });
    expect(p.path).toEqual([1_000_000, -2_000_000, -2_000_000, -2_000_000]);
    expect(p.months).toBeNull();
  });
});
