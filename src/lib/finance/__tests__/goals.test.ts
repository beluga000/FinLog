import { describe, expect, it } from "vitest";
import { allocateByPriority, evaluateGoal, simulatePriorityRaise } from "../goals";

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

describe("simulatePriorityRaise (대안 (d))", () => {
  const goals = [
    { id: "emergency", demand: 500, active: true },
    { id: "house", demand: 700, active: true },
    { id: "retire", demand: 300, active: true },
  ];

  it("한 칸 올리면 바로 위 목표의 몫을 가져온다", () => {
    expect(simulatePriorityRaise(goals, 1000, "house")).toEqual({
      allocated: 700,
      gain: 200,
      shortfall: 0,
      displaced: [{ id: "emergency", loss: 200 }],
    });
  });

  it("가져올 몫만큼만 늘고, 모자라면 남은 부족액", () => {
    expect(simulatePriorityRaise(goals, 1000, "retire")).toEqual({
      allocated: 300,
      gain: 300,
      shortfall: 0,
      displaced: [{ id: "house", loss: 300 }],
    });
    // 600 이면 house 가 100만 받고 있어 retire 가 그만큼만 가져온다
    expect(simulatePriorityRaise(goals, 600, "retire")).toEqual({
      allocated: 100,
      gain: 100,
      shortfall: 200,
      displaced: [{ id: "house", loss: 100 }],
    });
  });

  it("맨 위거나 위에 진행 중 목표가 없으면 null", () => {
    expect(simulatePriorityRaise(goals, 1000, "emergency")).toBeNull();
    const paused = [{ id: "old", demand: 0, active: false }, { id: "house", demand: 700, active: true }];
    expect(simulatePriorityRaise(paused, 300, "house")).toBeNull();
  });

  it("일시정지 목표는 건너뛰고 그 위 진행 중 목표 위로", () => {
    const list = [
      { id: "emergency", demand: 500, active: true },
      { id: "paused", demand: 0, active: false },
      { id: "house", demand: 700, active: true },
    ];
    expect(simulatePriorityRaise(list, 600, "house")).toEqual({
      allocated: 600,
      gain: 500,
      shortfall: 100,
      displaced: [{ id: "emergency", loss: 500 }],
    });
  });
});
