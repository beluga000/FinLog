import { describe, expect, it } from "vitest";
import { holidayName, shortHolidayName } from "../holidays";

describe("공휴일", () => {
  it("양력·음력 공휴일과 대체공휴일", () => {
    expect(holidayName("2026-02-17")).toBe("설날");
    expect(holidayName("2026-09-25")).toBe("추석");
    expect(holidayName("2026-08-17")).toBe("대체공휴일");
    expect(holidayName("2026-11-03")).toBeNull();
  });

  it("달력용 짧은 이름", () => {
    expect(shortHolidayName("설날 연휴")).toBe("설날");
    expect(shortHolidayName("대체공휴일")).toBe("대체휴일");
    expect(shortHolidayName("어린이날·부처님오신날")).toBe("어린이날");
  });
});
