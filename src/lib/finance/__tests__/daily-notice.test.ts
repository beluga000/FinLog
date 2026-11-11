import { describe, expect, it } from "vitest";
import { composeDailyNotice } from "../daily-notice";

const today = "2026-11-18";

describe("하루 알림", () => {
  it("보낼 게 없으면 null", () => {
    expect(composeDailyNotice({ today, shortfalls: [], reviewCount: 0 })).toBeNull();
  });

  it("잔액 부족이 먼저 — 가장 가까운 날 하나, 원인과 확인할 일을 덧붙인다", () => {
    const n = composeDailyNotice({
      today,
      shortfalls: [
        { date: "2026-11-20", accountName: "생활비 통장", amount: 500_000n, cause: null },
        { date: "2026-11-19", accountName: "입출금 통장", amount: 180_000n, cause: "카드 대금 272만" },
      ],
      reviewCount: 2,
    });
    expect(n).toEqual({
      title: "입출금 통장 내일 18만 모자랄 것 같아요",
      body: "카드 대금 272만 때문이에요. 미리 옮겨 두세요. · 확인할 기록 2건",
      url: "/dashboard",
      tag: "daily",
    });
  });

  it("확인할 일만 있으면 그것만", () => {
    expect(composeDailyNotice({ today, shortfalls: [], reviewCount: 3 })?.title).toBe("정기 거래로 자동 기록된 3건이 있어요");
    expect(composeDailyNotice({ today, shortfalls: [{ date: today, accountName: "통장", amount: 10_000n, cause: null }], reviewCount: 0 })?.title).toBe("통장 오늘 1만 모자랄 것 같아요");
  });
});
