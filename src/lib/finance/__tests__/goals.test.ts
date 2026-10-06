import { describe, expect, it } from "vitest";
import { allocateByPriority, evaluateGoal } from "../goals";

const base = {
  target: 1_200_000,
  targetIsReal: false,
  targetDate: "2027-10-06",
  expectedReturn: 0,
  current: 0,
  today: "2026-10-06",
};

describe("evaluateGoal", () => {
  it("납입액이 충분하면 onTrack, 대안 없음", () => {
    const e = evaluateGoal({ ...base, monthlyContribution: 100_000 });
    expect(e.monthsLeft).toBe(12);
    expect(e.required.monthly).toBe(100_000);
    expect(e.onTrack).toBe(true);
    expect(e.aheadMonths).toBe(0);
    expect(e.alternatives).toBeNull();
  });

  it("부족하면 늦어지는 개월 수와 대안 3종", () => {
    const e = evaluateGoal({ ...base, monthlyContribution: 50_000, higherReturn: 0.08 });
    expect(e.onTrack).toBe(false);
    expect(e.projectedMonths).toBe(24);
    expect(e.aheadMonths).toBe(-12);
    expect(e.alternatives?.extendToMonths).toBe(24);
    expect(e.alternatives?.reachableTarget).toBe(600_000);
    expect(e.alternatives?.higherReturn).not.toBeNull();
  });

  it("이미 달성 가능하면 onTrack + 진척률", () => {
    const e = evaluateGoal({ ...base, current: 1_500_000, monthlyContribution: 0 });
    expect(e.required.alreadyAchievable).toBe(true);
    expect(e.onTrack).toBe(true);
    expect(e.progress).toBeCloseTo(1.25);
  });

  it("납입 0이고 미달이면 달성 불가(null)", () => {
    const e = evaluateGoal({ ...base, monthlyContribution: 0 });
    expect(e.projectedMonths).toBeNull();
    expect(e.aheadMonths).toBeNull();
  });
});

describe("allocateByPriority", () => {
  it("우선순위 순서로 배분하고 부족분을 남긴다", () => {
    const r = allocateByPriority(
      [
        { id: "house", priority: 2, demand: 700 },
        { id: "emergency", priority: 1, demand: 500 },
        { id: "retire", priority: 3, demand: 300 },
      ],
      1000,
    );
    expect(r.get("emergency")).toEqual({ allocated: 500, shortfall: 0 });
    expect(r.get("house")).toEqual({ allocated: 500, shortfall: 200 });
    expect(r.get("retire")).toEqual({ allocated: 0, shortfall: 300 });
  });
});
