import { describe, expect, it } from "vitest";
import {
  allocateByPriority,
  claimsByAccount,
  clampStartAmount,
  evaluateGoal,
  goalCurrent,
  goalPlanPath,
  newMilestone,
  reachedMilestone,
  simulatePriorityRaise,
} from "../goals";

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

describe("goalCurrent — 기존 잔액을 목표 진척으로 통째로 치지 않는다", () => {
  it("시작 금액 0: 3천만 원 계좌를 골라도 처음엔 0원, 늘어난 만큼만 모인 돈", () => {
    const g = { startAmount: 0, baseBalance: 30_000_000 };
    expect(goalCurrent(g, 30_000_000)).toBe(0);
    expect(goalCurrent(g, 35_000_000)).toBe(5_000_000);
  });
  it("시작 금액 1천만 원: 그 뒤 증감을 더한다", () => {
    const g = { startAmount: 10_000_000, baseBalance: 30_000_000 };
    expect(goalCurrent(g, 32_000_000)).toBe(12_000_000);
    expect(goalCurrent(g, 25_000_000)).toBe(5_000_000);
  });
  it("잔액이 기준보다 많이 줄면 0원에서 멈춘다", () => {
    expect(goalCurrent({ startAmount: 1_000_000, baseBalance: 30_000_000 }, 20_000_000)).toBe(0);
  });
  it("기존 목표(둘 다 0)는 잔액 전체 — 예전 계산과 같다", () => {
    expect(goalCurrent({ startAmount: 0, baseBalance: 0 }, 30_000_000)).toBe(30_000_000);
  });
  it("시작 금액은 0 ~ 지금 잔액 사이로 맞춘다", () => {
    expect(clampStartAmount(40_000_000, 30_000_000)).toBe(30_000_000);
    expect(clampStartAmount(-5, 30_000_000)).toBe(0);
    expect(clampStartAmount(1_000_000, -2_000_000)).toBe(0);
  });
});

describe("진행률 알림 단계", () => {
  it("넘은 가장 높은 단계", () => {
    expect(reachedMilestone(0.24)).toBe(0);
    expect(reachedMilestone(0.25)).toBe(25);
    expect(reachedMilestone(0.502)).toBe(50);
    expect(reachedMilestone(1.3)).toBe(100);
  });
  it("이미 본 단계는 다시 알리지 않는다", () => {
    expect(newMilestone(0.55, 0)).toBe(50);
    expect(newMilestone(0.55, 50)).toBeNull();
    expect(newMilestone(0.8, 50)).toBe(75);
    expect(newMilestone(0.1, 0)).toBeNull();
  });
});

describe("goalPlanPath — 계획선", () => {
  it("수익률 0: 시작 금액에서 목표 금액까지 매달 같은 금액", () => {
    const plan = goalPlanPath({ start: 20_000_000, months: 36, target: 50_000_000, targetIsReal: false, expectedReturn: 0 });
    expect(plan(0)).toBe(20_000_000);
    expect(plan(12)).toBeCloseTo(30_000_000, -2);
    expect(plan(36)).toBeGreaterThanOrEqual(50_000_000);
  });
  it("이미 닿는 목표면 납입 없이 시작 금액만 굴린다", () => {
    const plan = goalPlanPath({ start: 60_000_000, months: 12, target: 50_000_000, targetIsReal: false, expectedReturn: 0 });
    expect(plan(12)).toBe(60_000_000);
  });
});

describe("claimsByAccount — 다른 목표가 쓰는 돈", () => {
  const balances = new Map([
    ["sav", 30_000_000],
    ["chk", 10_000_000],
  ]);
  it("계좌 하나짜리 목표는 모인 돈 전부를 그 계좌에", () => {
    const m = claimsByAccount([{ id: "g1", name: "결혼 자금", current: 10_000_000, linkedAccountIds: ["sav"] }], balances);
    expect(m.get("sav")).toEqual([{ goalId: "g1", name: "결혼 자금", amount: 10_000_000 }]);
    expect(m.has("chk")).toBe(false);
  });
  it("계좌 여러 개면 잔액 비율로 나눈다", () => {
    const m = claimsByAccount([{ id: "g1", name: "여행", current: 4_000_000, linkedAccountIds: ["sav", "chk"] }], balances);
    expect(m.get("sav")?.[0].amount).toBe(3_000_000);
    expect(m.get("chk")?.[0].amount).toBe(1_000_000);
  });
  it("모인 돈이 0이거나 보이지 않는 계좌는 건너뛴다", () => {
    const m = claimsByAccount(
      [
        { id: "g1", name: "a", current: 0, linkedAccountIds: ["sav"] },
        { id: "g2", name: "b", current: 1_000_000, linkedAccountIds: ["gone"] },
      ],
      balances,
    );
    expect(m.size).toBe(0);
  });
});
