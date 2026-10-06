import { describe, expect, it } from "vitest";
import { computeBalances, summarizeNetWorth } from "../balance";
import { formatCompactKRW, formatKRW, parseWon, ratio } from "../money";
import { getMonthKey, getMonthRange, inRange, monthsBetween, shiftMonth } from "../period";
import { dueDates, scheduledDateFor } from "../recurring";
import { calculateMonthlyStats, compareMonths } from "../stats";
import { validateTxShape } from "../tx-rules";
import type { CategoryNode, LedgerTx } from "../types";
import { canSeeAccount, scopeTransactions, txAccess } from "../visibility";
import { MODEL_ALLOCATIONS, portfolioMetrics, profileReturn } from "../portfolio";

const categories: CategoryNode[] = [
  { id: "food", name: "식비", parentId: null, bucket: "NEEDS" },
  { id: "food-cafe", name: "카페", parentId: "food", bucket: "WANTS" },
  { id: "food-grocery", name: "장보기", parentId: "food", bucket: null },
  { id: "house", name: "주거·관리비", parentId: null, bucket: "NEEDS" },
  { id: "hobby", name: "문화·여가", parentId: null, bucket: "WANTS" },
  { id: "salary", name: "급여", parentId: null, bucket: null },
];

let seq = 0;
function tx(partial: Partial<LedgerTx> & Pick<LedgerTx, "type" | "amount">): LedgerTx {
  return {
    id: `t${++seq}`,
    date: "2026-10-10",
    categoryId: null,
    createdByUserId: "A",
    visibility: "SHARED",
    isFixed: false,
    fromAccountId: null,
    toAccountId: null,
    ...partial,
  };
}

describe("월 통계 — 이중 집계 방지", () => {
  it("AC-1: 카드 지출 5만원 후 카드대금 TRANSFER 를 해도 지출은 5만원 1회", () => {
    const txs = [
      tx({ type: "EXPENSE", amount: 50_000n, categoryId: "food-grocery", fromAccountId: "card" }),
      tx({ type: "TRANSFER", amount: 50_000n, fromAccountId: "bank", toAccountId: "card", date: "2026-10-25" }),
    ];
    const s = calculateMonthlyStats(txs, categories);
    expect(s.expense).toBe(50_000n);
    expect(s.income).toBe(0n);
    expect(s.saving).toBe(0n);
  });

  it("AC-2: 증권계좌 SAVE_INVEST 100만원은 지출이 아니라 저축률에 반영", () => {
    const txs = [
      tx({ type: "INCOME", amount: 4_000_000n, categoryId: "salary", toAccountId: "bank" }),
      tx({ type: "SAVE_INVEST", amount: 1_000_000n, fromAccountId: "bank", toAccountId: "stock" }),
      tx({ type: "LOAN_REPAY", amount: 200_000n, fromAccountId: "bank", toAccountId: "loan" }),
    ];
    const s = calculateMonthlyStats(txs, categories);
    expect(s.expense).toBe(0n);
    expect(s.saving).toBe(1_200_000n);
    expect(s.savingsRate).toBeCloseTo(0.3, 10);
    expect(s.remaining).toBe(2_800_000n);
  });

  it("50/30/20 버킷: 자식 버킷 우선, 없으면 부모 버킷 상속, 미분류는 WANTS 비율로", () => {
    const txs = [
      tx({ type: "INCOME", amount: 1_000_000n, categoryId: "salary" }),
      tx({ type: "EXPENSE", amount: 100_000n, categoryId: "food-cafe" }),
      tx({ type: "EXPENSE", amount: 300_000n, categoryId: "food-grocery", isFixed: true }),
      tx({ type: "EXPENSE", amount: 50_000n, categoryId: null }),
    ];
    const s = calculateMonthlyStats(txs, categories);
    expect(s.buckets).toEqual({ NEEDS: 300_000n, WANTS: 100_000n, SAVINGS: 0n, UNCLASSIFIED: 50_000n });
    expect(s.bucketRatios.NEEDS).toBeCloseTo(0.3);
    expect(s.bucketRatios.WANTS).toBeCloseTo(0.15);
    expect(s.fixedExpense).toBe(300_000n);
    expect(s.variableExpense).toBe(150_000n);
  });

  it("카테고리 Top: 대분류로 합산, 금액 내림차순, 미분류 포함", () => {
    const txs = [
      tx({ type: "EXPENSE", amount: 10n, categoryId: "food-cafe" }),
      tx({ type: "EXPENSE", amount: 20n, categoryId: "food-grocery" }),
      tx({ type: "EXPENSE", amount: 25n, categoryId: "hobby" }),
      tx({ type: "EXPENSE", amount: 5n, categoryId: null }),
    ];
    const top = calculateMonthlyStats(txs, categories).expenseByTopCategory;
    expect(top.map((c) => [c.name, c.amount])).toEqual([["식비", 30n], ["문화·여가", 25n], ["미분류", 5n]]);
    expect(top[0].share).toBeCloseTo(0.5);
  });

  it("수입 0이면 저축률 null", () => {
    expect(calculateMonthlyStats([], categories).savingsRate).toBeNull();
  });

  it("전월 대비 증감", () => {
    const cur = calculateMonthlyStats([tx({ type: "EXPENSE", amount: 150n, categoryId: "hobby" })], categories);
    const prev = calculateMonthlyStats([tx({ type: "EXPENSE", amount: 100n, categoryId: "hobby" })], categories);
    const c = compareMonths(cur, prev);
    expect(c.expense.diff).toBe(50n);
    expect(c.expense.rate).toBeCloseTo(0.5);
    expect(c.topExpenses[0].delta.diff).toBe(50n);
    expect(c.income.rate).toBeNull();
  });
});

describe("공개범위 (AC-3, AC-4)", () => {
  const txs = [
    tx({ type: "EXPENSE", amount: 1n, createdByUserId: "A", visibility: "SHARED" }),
    tx({ type: "EXPENSE", amount: 2n, createdByUserId: "A", visibility: "SUMMARY_ONLY" }),
    tx({ type: "EXPENSE", amount: 4n, createdByUserId: "A", visibility: "PRIVATE" }),
    tx({ type: "EXPENSE", amount: 8n, createdByUserId: "B", visibility: "SHARED" }),
  ];

  it("AC-3: B는 A의 PRIVATE 거래를 어떤 스코프에서도 볼 수 없다 (합계 포함)", () => {
    for (const scope of ["us", "me", "partner"] as const) {
      const { items, summarized } = scopeTransactions(txs, "B", scope);
      const total = [...items, ...summarized].reduce((s, t) => s + t.amount, 0n);
      expect(total & 4n).toBe(0n);
    }
  });

  it("AC-4: SUMMARY_ONLY 는 B에게 합계로만 — id·계좌·작성자 없이", () => {
    const { items, summarized } = scopeTransactions(txs, "B", "us");
    expect(items.map((t) => t.amount)).toEqual([1n, 8n]);
    expect(summarized).toHaveLength(1);
    expect(summarized[0]).toEqual({ type: "EXPENSE", amount: 2n, categoryId: null, date: "2026-10-10", isFixed: false });
    expect(Object.keys(summarized[0])).not.toContain("id");
  });

  it("작성자 본인은 us/me 에서 전부 본다", () => {
    expect(scopeTransactions(txs, "A", "us").items.map((t) => t.amount)).toEqual([1n, 2n, 4n, 8n]);
    expect(scopeTransactions(txs, "A", "me").items.map((t) => t.amount)).toEqual([1n, 2n, 4n]);
  });

  it("partner 스코프는 배우자 공개분만", () => {
    const r = scopeTransactions(txs, "B", "partner");
    expect(r.items.map((t) => t.amount)).toEqual([1n]);
    expect(r.summarized.map((t) => t.amount)).toEqual([2n]);
    expect(txAccess({ createdByUserId: "B", visibility: "SHARED" }, "B", "partner")).toBe("none");
  });

  it("계좌: 배우자 PRIVATE 계좌는 숨김, 공동명의는 me 에서 제외", () => {
    const priv = { ownerUserId: "A", defaultVisibility: "PRIVATE" as const, type: "SAVINGS" as const };
    const joint = { ownerUserId: null, defaultVisibility: "SHARED" as const, type: "CHECKING" as const };
    expect(canSeeAccount(priv, "B", "us")).toBe(false);
    expect(canSeeAccount(priv, "A", "us")).toBe(true);
    expect(canSeeAccount(joint, "B", "us")).toBe(true);
    expect(canSeeAccount(joint, "B", "me")).toBe(false);
    expect(canSeeAccount(joint, "B", "partner")).toBe(false);
  });
});

describe("월 경계 (AC-5)", () => {
  it("월 시작일 25일이면 10월 = 9/25 ~ 10/24", () => {
    const range = getMonthRange("2026-10", 25);
    expect(range).toEqual({ start: "2026-09-25", end: "2026-10-25" });
    expect(inRange("2026-09-24", range)).toBe(false);
    expect(inRange("2026-09-25", range)).toBe(true);
    expect(inRange("2026-10-24", range)).toBe(true);
    expect(inRange("2026-10-25", range)).toBe(false);
    expect(getMonthKey("2026-10-25", 25)).toBe("2026-11");
    expect(getMonthKey("2026-10-24", 25)).toBe("2026-10");
  });
  it("월 시작일 1일 + 연도 경계", () => {
    expect(getMonthRange("2026-12", 1)).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(getMonthRange("2027-01", 25)).toEqual({ start: "2026-12-25", end: "2027-01-25" });
    expect(getMonthKey("2026-12-31", 25)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("시작일은 1~28로 보정", () => {
    expect(getMonthRange("2026-03", 31)).toEqual({ start: "2026-02-28", end: "2026-03-28" });
  });
  it("monthsBetween", () => {
    expect(monthsBetween("2026-10-06", "2027-10-06")).toBe(12);
    expect(monthsBetween("2026-10-06", "2027-10-05")).toBe(11);
    expect(monthsBetween("2026-10-06", "2025-01-01")).toBe(0);
  });
});

describe("계좌 잔액 & 순자산", () => {
  it("스냅샷 + 이후 흐름, 카드 사용과 대금 결제", () => {
    const snaps = [
      { accountId: "bank", asOf: "2026-10-01", balance: 1_000_000n },
      { accountId: "card", asOf: "2026-10-01", balance: 0n },
    ];
    const flows = [
      { date: "2026-10-01", amount: 999n, fromAccountId: "bank", toAccountId: null }, // 스냅샷 당일 → 이미 반영
      { date: "2026-10-03", amount: 50_000n, fromAccountId: "card", toAccountId: null },
      { date: "2026-10-25", amount: 50_000n, fromAccountId: "bank", toAccountId: "card" },
    ];
    const mid = computeBalances(["bank", "card"], snaps, flows, "2026-10-10");
    expect(mid.get("bank")).toBe(1_000_000n);
    expect(mid.get("card")).toBe(-50_000n);
    const end = computeBalances(["bank", "card"], snaps, flows, "2026-10-31");
    expect(end.get("bank")).toBe(950_000n);
    expect(end.get("card")).toBe(0n);
    const nw = summarizeNetWorth([{ id: "bank", type: "CHECKING" }, { id: "card", type: "CREDIT_CARD" }], mid);
    expect(nw).toEqual({ assets: 1_000_000n, liabilities: 50_000n, netWorth: 950_000n });
  });
  it("기준일 이후 스냅샷은 무시, 스냅샷 없으면 0부터", () => {
    const b = computeBalances(
      ["x"],
      [{ accountId: "x", asOf: "2026-12-01", balance: 5n }],
      [{ date: "2026-10-01", amount: 3n, fromAccountId: null, toAccountId: "x" }],
      "2026-11-01",
    );
    expect(b.get("x")).toBe(3n);
  });
});

describe("정기 거래 발생일", () => {
  it("말일(0)과 31일 보정", () => {
    expect(scheduledDateFor(2026, 2, { dayOfMonth: 0, businessDayAdjust: "NONE" })).toBe("2026-02-28");
    expect(scheduledDateFor(2026, 4, { dayOfMonth: 31, businessDayAdjust: "NONE" })).toBe("2026-04-30");
  });
  it("주말 보정: 2026-10-25(일) → PREV 10-23(금), NEXT 10-26(월)", () => {
    expect(scheduledDateFor(2026, 10, { dayOfMonth: 25, businessDayAdjust: "PREV" })).toBe("2026-10-23");
    expect(scheduledDateFor(2026, 10, { dayOfMonth: 25, businessDayAdjust: "NEXT" })).toBe("2026-10-26");
  });
  it("마지막 실행일 이후 ~ 오늘까지만, 시작/종료일 준수", () => {
    const rule = { dayOfMonth: 10, businessDayAdjust: "NONE" as const, startDate: "2026-07-15", endDate: "2026-12-31" };
    expect(dueDates(rule, null, "2026-10-06")).toEqual(["2026-08-10", "2026-09-10"]);
    expect(dueDates(rule, "2026-08-10", "2026-10-10")).toEqual(["2026-09-10", "2026-10-10"]);
    expect(dueDates({ ...rule, endDate: "2026-09-01" }, null, "2026-12-31")).toEqual(["2026-08-10"]);
  });
});

describe("거래 유형 규칙", () => {
  const base = { fromAccountType: null, toAccountType: null, fromAccountId: null, toAccountId: null, categoryId: null };
  it("지출은 출금계좌+카테고리 필수", () => {
    expect(validateTxShape({ ...base, type: "EXPENSE" })).toHaveLength(2);
    expect(validateTxShape({ ...base, type: "EXPENSE", fromAccountId: "a", categoryId: "c" })).toEqual([]);
  });
  it("저축·투자는 자산형 계좌로만", () => {
    const errs = validateTxShape({
      ...base, type: "SAVE_INVEST", fromAccountId: "a", toAccountId: "b", toAccountType: "CREDIT_CARD",
    });
    expect(errs.join()).toContain("예적금");
  });
  it("이체 같은 계좌 불가, 잔액보정은 한쪽만", () => {
    expect(validateTxShape({ ...base, type: "TRANSFER", fromAccountId: "a", toAccountId: "a" })).toHaveLength(1);
    expect(validateTxShape({ ...base, type: "ADJUSTMENT", fromAccountId: "a", toAccountId: "b" })).toHaveLength(1);
    expect(validateTxShape({ ...base, type: "ADJUSTMENT", toAccountId: "b" })).toEqual([]);
  });
  it("대출상환은 대출 계좌로", () => {
    expect(validateTxShape({ ...base, type: "LOAN_REPAY", fromAccountId: "a", toAccountId: "b", toAccountType: "SAVINGS" })).toHaveLength(1);
  });
});

describe("money", () => {
  it("포맷·파싱", () => {
    expect(formatKRW(1234567n)).toBe("₩1,234,567");
    expect(formatKRW(-500n)).toBe("-₩500");
    expect(formatKRW(500, { sign: true })).toBe("+₩500");
    expect(formatCompactKRW(123_400_000n)).toBe("1.2억");
    expect(formatCompactKRW(1_234_000)).toBe("123.4만");
    expect(formatCompactKRW(9800)).toBe("9,800원");
    expect(parseWon("₩1,234,000")).toBe(1_234_000n);
    expect(parseWon("abc")).toBeNull();
    expect(ratio(1n, 0n)).toBeNull();
  });
});

describe("모델 포트폴리오", () => {
  it("모든 모델 배분 합계 100, 성향이 높을수록 기대수익률 증가", () => {
    for (const alloc of Object.values(MODEL_ALLOCATIONS)) {
      expect(Object.values(alloc).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(profileReturn("STABLE")).toBeLessThan(profileReturn("NEUTRAL"));
    expect(profileReturn("NEUTRAL")).toBeLessThan(profileReturn("AGGRESSIVE"));
    expect(portfolioMetrics({})).toEqual({ expectedReturn: 0, volatility: 0 });
  });
});
