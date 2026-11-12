import { describe, expect, it } from "vitest";
import { composeDailyNotice, composeEventNotices, spendableCrossing } from "../daily-notice";

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

describe("일이 생겼을 때 알림", () => {
  const card = { cardId: "c1", cardName: "생활비", date: "2026-11-20", toPay: 1_230_000n, paymentName: "입출금 통장", shortBy: null };

  it("카드값은 결제 이틀 전과 당일에만", () => {
    expect(composeEventNotices({ today: "2026-11-18", cardDues: [card], spendable: null, milestones: [] })[0]).toEqual({
      title: "생활비 카드값 모레 123만",
      body: "입출금 통장에서 빠져요.",
      url: "/dashboard",
      tag: "card-c1",
    });
    expect(composeEventNotices({ today: "2026-11-19", cardDues: [card], spendable: null, milestones: [] })).toEqual([]);
    expect(composeEventNotices({ today: "2026-11-20", cardDues: [{ ...card, shortBy: 300_000n }], spendable: null, milestones: [] })[0].title).toBe(
      "생활비 카드값 오늘 123만",
    );
  });

  it("출금 계좌가 모자라면 덧붙인다", () => {
    const [n] = composeEventNotices({ today: "2026-11-18", cardDues: [{ ...card, shortBy: 300_000n }], spendable: null, milestones: [] });
    expect(n.body).toBe("입출금 통장에서 빠져요. 30만 모자라요 — 미리 옮겨 두세요.");
  });

  it("쓸 수 있는 돈은 선을 처음 넘은 날만", () => {
    expect(spendableCrossing(0.7, 0.85)).toBe("warn");
    expect(spendableCrossing(0.85, 0.9)).toBeNull();
    expect(spendableCrossing(0.9, 1.05)).toBe("over");
    expect(spendableCrossing(0.5, 1.2)).toBe("over");
    expect(spendableCrossing(null, 1.2)).toBeNull();
    const [n] = composeEventNotices({ today: "2026-11-18", cardDues: [], spendable: { level: "over", remaining: -120_000n }, milestones: [] });
    expect(n).toMatchObject({ title: "이번 달 쓸 수 있는 돈을 넘었어요", url: "/reports", tag: "spendable" });
  });

  it("목표 진행률", () => {
    const ns = composeEventNotices({
      today: "2026-11-18",
      cardDues: [],
      spendable: null,
      milestones: [
        { goalId: "g1", name: "내 집 마련", percent: 50 },
        { goalId: "g2", name: "여행", percent: 100 },
      ],
    });
    expect(ns.map((n) => n.title)).toEqual(["내 집 마련 50% 모였어요", "여행 목표 금액을 다 모았어요!"]);
  });
});
