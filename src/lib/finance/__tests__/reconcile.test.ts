import { describe, expect, it } from "vitest";
import { isBalanceStale, netWorthDelta, recentPayday, toDisplay, toStored } from "../reconcile";

const rule = (dayOfMonth: number, extra: Partial<{ startDate: string; endDate: string | null; businessDayAdjust: "NONE" | "PREV" | "NEXT" }> = {}) => ({
  dayOfMonth,
  businessDayAdjust: "NONE" as const,
  startDate: "2026-01-01",
  endDate: null,
  ...extra,
});

describe("잔액이 낡았는지", () => {
  it("30일 기준, 1년에 한 번 고른 계좌는 365일", () => {
    expect(isBalanceStale(null, "2026-11-06", false)).toBe(true);
    expect(isBalanceStale("2026-10-07", "2026-11-06", false)).toBe(false);
    expect(isBalanceStale("2026-10-06", "2026-11-06", false)).toBe(true);
    expect(isBalanceStale("2026-05-31", "2026-11-06", true)).toBe(false);
    expect(isBalanceStale("2025-11-05", "2026-11-06", true)).toBe(true);
  });
});

describe("월급날 직후", () => {
  it("월급일부터 3일 동안만", () => {
    expect(recentPayday([rule(25)], "2026-11-24")).toBeNull();
    expect(recentPayday([rule(25)], "2026-11-25")).toBe("2026-11-25");
    expect(recentPayday([rule(25)], "2026-11-28")).toBe("2026-11-25");
    expect(recentPayday([rule(25)], "2026-11-29")).toBeNull();
  });

  it("말일 월급이 지난달 날짜여도, 두 규칙이면 최근 것", () => {
    expect(recentPayday([rule(0)], "2026-11-02")).toBe("2026-10-31");
    expect(recentPayday([rule(25), rule(27)], "2026-11-28")).toBe("2026-11-27");
  });

  it("시작 전·끝난 규칙은 보지 않는다", () => {
    expect(recentPayday([rule(25, { startDate: "2026-12-01" })], "2026-11-26")).toBeNull();
    expect(recentPayday([rule(25, { endDate: "2026-10-31" })], "2026-11-26")).toBeNull();
  });
});

describe("순자산 변화", () => {
  it("자산은 늘어난 만큼, 부채는 줄어든 만큼, 보증금 대출은 빼고", () => {
    const rows = [
      { id: "isa", type: "INVESTMENT" as const, balance: 24_562_700n },
      { id: "card", type: "CREDIT_CARD" as const, balance: -2_721_400n },
      { id: "jeonse", type: "LOAN" as const, depositLoan: true, balance: -78_500_000n },
    ];
    const next = new Map([
      ["isa", 25_180_000n],
      ["card", toStored("CREDIT_CARD", 2_500_000n)],
      ["jeonse", toStored("LOAN", 70_000_000n)],
    ]);
    expect(netWorthDelta(rows, next)).toBe(617_300n + 221_400n);
  });

  it("부채는 화면에서 양수로", () => {
    expect(toDisplay("LOAN", -100n)).toBe(100n);
    expect(toStored("LOAN", 100n)).toBe(-100n);
    expect(toStored("CHECKING", -5n)).toBe(-5n);
  });
});
