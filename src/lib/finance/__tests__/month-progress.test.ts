import { describe, expect, it } from "vitest";
import { samePeriodRange, summarizePlanned, upcomingPlanned, type PlannedRule } from "../month-progress";

describe("samePeriodRange", () => {
  const nov = { start: "2026-11-01", end: "2026-12-01" };
  const oct = { start: "2026-10-01", end: "2026-11-01" };

  it("이번 달 지난 날 수만큼 지난달을 자른다 (end 미포함)", () => {
    expect(samePeriodRange(nov, oct, "2026-11-06")).toEqual({ start: "2026-10-01", end: "2026-10-07" });
    expect(samePeriodRange(nov, oct, "2026-11-01")).toEqual({ start: "2026-10-01", end: "2026-10-02" });
  });

  it("지난달이 더 짧으면 지난달 끝까지만", () => {
    const mar = { start: "2026-03-01", end: "2026-04-01" };
    const feb = { start: "2026-02-01", end: "2026-03-01" };
    expect(samePeriodRange(mar, feb, "2026-03-31")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
  });

  it("월 시작일 25일", () => {
    const cur = { start: "2026-10-25", end: "2026-11-25" };
    const prev = { start: "2026-09-25", end: "2026-10-25" };
    expect(samePeriodRange(cur, prev, "2026-11-06")).toEqual({ start: "2026-09-25", end: "2026-10-08" });
  });

  it("끝난 달이면 null", () => {
    expect(samePeriodRange(oct, { start: "2026-09-01", end: "2026-10-01" }, "2026-11-06")).toBeNull();
  });
});

describe("upcomingPlanned / summarizePlanned", () => {
  const rule = (o: Partial<PlannedRule> & Pick<PlannedRule, "name" | "type" | "amount" | "dayOfMonth">): PlannedRule => ({
    businessDayAdjust: "NONE",
    startDate: "2026-01-01",
    endDate: null,
    isActive: true,
    lastRunOn: null,
    ...o,
  });
  const range = { start: "2026-11-01", end: "2026-12-01" };

  it("오늘 뒤 이번 달 회차만, 이미 생성된 회차·꺼진 규칙은 뺀다", () => {
    const items = upcomingPlanned(
      [
        rule({ name: "월급", type: "INCOME", amount: 7_270_000n, dayOfMonth: 25, lastRunOn: "2026-10-25" }),
        rule({ name: "관리비", type: "EXPENSE", amount: 250_000n, dayOfMonth: 3, lastRunOn: "2026-11-03" }),
        rule({ name: "청약", type: "SAVE_INVEST", amount: 500_000n, dayOfMonth: 26, lastRunOn: "2026-10-26" }),
        rule({ name: "옛 적금", type: "SAVE_INVEST", amount: 100_000n, dayOfMonth: 10, isActive: false }),
      ],
      "2026-11-06",
      range,
    );
    expect(items.map((i) => [i.name, i.date])).toEqual([
      ["월급", "2026-11-25"],
      ["청약", "2026-11-26"],
    ]);
    expect(summarizePlanned(items)).toEqual({
      income: 7_270_000n,
      saving: 500_000n,
      incomeDate: "2026-11-25",
      savingDate: "2026-11-26",
    });
  });

  it("다음 회차가 다음 달이면 빠진다", () => {
    const items = upcomingPlanned([rule({ name: "월급", type: "INCOME", amount: 1n, dayOfMonth: 5, lastRunOn: "2026-11-05" })], "2026-11-06", range);
    expect(items).toEqual([]);
    expect(summarizePlanned(items)).toEqual({ income: 0n, saving: 0n, incomeDate: null, savingDate: null });
  });
});
