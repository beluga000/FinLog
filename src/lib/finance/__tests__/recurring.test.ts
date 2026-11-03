import { describe, expect, it } from "vitest";
import { lastRunAfterScheduleChange, nextDueDate, type RecurringSchedule } from "../recurring";

const rule = (r: Partial<RecurringSchedule>): RecurringSchedule => ({
  dayOfMonth: 25,
  businessDayAdjust: "NONE",
  startDate: "2026-01-01",
  endDate: null,
  ...r,
});

describe("nextDueDate", () => {
  it("이번 달 회차가 아직이면 이번 달, 이미 생성됐으면 다음 달", () => {
    expect(nextDueDate(rule({}), "2026-10-25", "2026-11-03")).toBe("2026-11-25");
    expect(nextDueDate(rule({}), "2026-11-25", "2026-11-25")).toBe("2026-12-25");
  });

  it("종료일을 넘으면 null", () => {
    expect(nextDueDate(rule({ endDate: "2026-12-01" }), "2026-11-25", "2026-11-26")).toBeNull();
  });

  it("시작일이 미래면 시작일 이후 첫 회차", () => {
    expect(nextDueDate(rule({ dayOfMonth: 5, startDate: "2027-01-10" }), null, "2026-11-03")).toBe("2027-02-05");
    expect(nextDueDate(rule({ dayOfMonth: 15, startDate: "2027-01-10" }), null, "2026-11-03")).toBe("2027-01-15");
  });

  it("직전 금요일 보정으로 다음 달 1일 회차가 이번 달 말로 당겨진다 (2026-11-01 일요일 → 10/30)", () => {
    expect(nextDueDate(rule({ dayOfMonth: 1, businessDayAdjust: "PREV" }), "2026-10-01", "2026-10-29")).toBe("2026-10-30");
  });

  it("말일 + 다음 월요일 보정 (2026-10-31 토요일 → 11/2)", () => {
    expect(nextDueDate(rule({ dayOfMonth: 0, businessDayAdjust: "NEXT" }), "2026-09-30", "2026-10-20")).toBe("2026-11-02");
  });
});

describe("lastRunAfterScheduleChange", () => {
  it("이미 나간 달의 새 날짜까지 실행됨으로 본다 — 10일 → 25일이면 이번 달 25일은 건너뜀", () => {
    expect(lastRunAfterScheduleChange({ dayOfMonth: 10, businessDayAdjust: "NONE" }, { dayOfMonth: 25, businessDayAdjust: "NONE" }, "2026-11-10")).toBe("2026-11-25");
  });

  it("새 날짜가 지난 회차보다 앞이면 그대로 — 아직 안 나간 달 회차는 생성된다", () => {
    expect(lastRunAfterScheduleChange({ dayOfMonth: 25, businessDayAdjust: "NONE" }, { dayOfMonth: 1, businessDayAdjust: "NONE" }, "2026-10-25")).toBe("2026-10-25");
  });

  it("주말 보정으로 다음 달로 밀린 회차는 원래 달 회차로 본다 (10월 말일분이 11/2 생성)", () => {
    expect(lastRunAfterScheduleChange({ dayOfMonth: 0, businessDayAdjust: "NEXT" }, { dayOfMonth: 25, businessDayAdjust: "NONE" }, "2026-11-02")).toBe("2026-11-02");
  });
});
