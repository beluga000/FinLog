import { describe, expect, it } from "vitest";
import { forecastBalances } from "../forecast";
import { allInstallmentCharges, billForDate, chargesAfter, chargesBetween, installmentCharges, installmentStatus } from "../installments";

describe("할부 회차", () => {
  it("산 날 뒤 첫 결제일부터 매달, 나머지 원은 1회차에", () => {
    const c = installmentCharges({ date: "2026-11-10", amount: 1_000_001n, months: 3 }, 14);
    expect(c).toEqual([
      { date: "2026-11-14", amount: 333_335n, seq: 1 },
      { date: "2026-12-14", amount: 333_333n, seq: 2 },
      { date: "2027-01-14", amount: 333_333n, seq: 3 },
    ]);
    expect(c.reduce((s, x) => s + x.amount, 0n)).toBe(1_000_001n);
  });

  it("결제일에 샀거나 결제일이 지났으면 다음 달부터, 31일 결제는 말일", () => {
    expect(installmentCharges({ date: "2026-11-14", amount: 200n, months: 2 }, 14)[0].date).toBe("2026-12-14");
    expect(installmentCharges({ date: "2026-11-20", amount: 200n, months: 2 }, 14)[0].date).toBe("2026-12-14");
    expect(installmentCharges({ date: "2027-01-31", amount: 200n, months: 2 }, 31).map((c) => c.date)).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("결제일을 모르는 카드는 산 날짜를 결제일로", () => {
    expect(installmentCharges({ date: "2026-11-10", amount: 200n, months: 2 }, null).map((c) => c.date)).toEqual(["2026-12-10", "2027-01-10"]);
  });

  it("일시불·0원은 회차가 없다", () => {
    expect(installmentCharges({ date: "2026-11-10", amount: 100n, months: 1 }, 14)).toEqual([]);
    expect(installmentCharges({ date: "2026-11-10", amount: 0n, months: 3 }, 14)).toEqual([]);
  });

  it("이번 결제일 카드값 = 잔액 − 다음 달 이후 회차", () => {
    const charges = allInstallmentCharges([{ date: "2026-11-01", amount: 3_000_000n, months: 10 }], 14);
    expect(chargesAfter(charges, "2026-11-14")).toBe(2_700_000n);
    expect(chargesBetween(charges, "2026-11-14", "2026-12-14")).toBe(300_000n);
    // 카드 잔액 = 할부 300만 + 일시불 50만
    expect(billForDate(3_500_000n, charges, "2026-11-14")).toBe(800_000n);
    // 기록이 빠져 잔액이 더 작으면 0
    expect(billForDate(1_000_000n, charges, "2026-11-14")).toBe(0n);
  });

  it("남은 할부 현황 — 오늘 포함 이후 회차, 같은 결제일은 합친다", () => {
    const st = installmentStatus(
      [
        { date: "2026-09-01", amount: 300_000n, months: 3 }, // 9/14·10/14·11/14
        { date: "2026-10-20", amount: 1_200_000n, months: 12 }, // 11/14 ~ 2027-10/14
        { date: "2026-01-01", amount: 200_000n, months: 2 }, // 다 끝남
      ],
      14,
      "2026-11-11",
    );
    expect(st).toEqual({ remaining: 100_000n + 1_200_000n, count: 2, next: { date: "2026-11-14", amount: 200_000n } });
  });
});

describe("통장 예보 — 할부", () => {
  it("아직 청구되지 않은 할부 원금은 결제일마다 한 회차씩만 나간다", () => {
    const charges = allInstallmentCharges([{ date: "2026-11-01", amount: 3_000_000n, months: 10 }], 20);
    const [living] = forecastBalances({
      accounts: [{ id: "living", name: "생활비 통장", balance: 2_000_000n, dailySpend: 0n }],
      rules: [],
      cards: [{ id: "card", name: "웨딩 카드", billingDay: 20, paymentAccountId: "living", unpaid: 3_500_000n, dailySpend: 0n, installments: charges }],
      today: "2026-11-06",
      days: 45,
    });
    expect(living.events.map((e) => [e.date, e.amount])).toEqual([
      ["2026-11-20", -800_000n],
      ["2026-12-20", -300_000n],
    ]);
    expect(living.shortfall).toBeNull();
  });
});
