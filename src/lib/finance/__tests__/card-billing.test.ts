import { describe, expect, it } from "vitest";
import { billingDateIn, upcomingCardDue } from "../card-billing";

describe("카드 결제일", () => {
  it("짧은 달은 말일로 당긴다", () => {
    expect(billingDateIn(2026, 2, 31)).toBe("2026-02-28");
    expect(billingDateIn(2028, 2, 30)).toBe("2028-02-29");
    expect(billingDateIn(2026, 11, 15)).toBe("2026-11-15");
  });

  it("결제일 5일 전부터 2일 뒤까지만 알린다", () => {
    expect(upcomingCardDue("2026-11-09", 15)).toBeNull();
    expect(upcomingCardDue("2026-11-10", 15)).toBe("2026-11-15");
    expect(upcomingCardDue("2026-11-15", 15)).toBe("2026-11-15");
    expect(upcomingCardDue("2026-11-17", 15)).toBe("2026-11-15");
    expect(upcomingCardDue("2026-11-18", 15)).toBeNull();
  });

  it("달·해가 바뀌는 경계도 찾는다", () => {
    expect(upcomingCardDue("2026-12-29", 2)).toBe("2027-01-02");
    expect(upcomingCardDue("2027-01-01", 31)).toBe("2026-12-31");
    expect(upcomingCardDue("2026-11-28", 1)).toBe("2026-12-01");
    expect(upcomingCardDue("2027-02-25", 31)).toBe("2027-02-28");
  });
});
