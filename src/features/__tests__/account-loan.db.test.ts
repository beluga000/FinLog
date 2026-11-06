/**
 * DB 통합 테스트 — 대출 계좌 추가 (상환 방식·보증금 대출·이자 자동 기록)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 서버 액션의 로그인 컨텍스트를 테스트 사용자로 바꿔 끼운다
const viewer = vi.hoisted(() => ({ userId: "", householdId: "" }));
vi.mock("@/lib/db/context", () => ({
  requireHousehold: async () => ({ userId: viewer.userId, householdId: viewer.householdId, partner: null }),
  writeAudit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAccount } from "@/features/accounts/actions";
import { getAccountOverview } from "@/features/accounts/queries";
import type { RecurringTemplate } from "@/features/ledger/queries";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma } from "@/lib/db/prisma";
import { addDays, todayKST } from "@/lib/finance/period";

const TAG = `t${Date.now()}`;
let A: string;
let hid: string;
let bank: string;

const loanInput = (over: Record<string, unknown>) => ({
  name: "전세자금대출",
  type: "LOAN",
  institution: "신한은행",
  owner: "me",
  defaultVisibility: "SHARED",
  openingBalance: "100000000",
  interestRatePct: 3.6,
  maturityDate: addDays(todayKST(), 700),
  billingDay: 25,
  paymentAccountId: bank,
  loanRepayment: "BULLET",
  ...over,
});

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `loan-a-${TAG}@test`, name: "A" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "A", ownerUserId: A }), { timeout: 30_000 })).id;
  bank = (
    await prisma.account.create({
      data: { householdId: hid, ownerUserId: A, name: "A 통장", type: "CHECKING", snapshots: { create: { asOf: new Date("2026-01-01"), balance: 5_000_000n } } },
    })
  ).id;
  viewer.userId = A;
  viewer.householdId = hid;
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("대출 계좌 추가", () => {
  it("보증금 대출 + 만기일시: 순자산에서 빠지고 매달 이자 지출 규칙이 생긴다", async () => {
    const r = await createAccount(loanInput({ depositLoan: true, autoInterest: true }));
    expect(r.ok).toBe(true);
    const id = (r as { data: { id: string } }).data.id;

    const acc = await prisma.account.findUniqueOrThrow({ where: { id } });
    expect(acc).toMatchObject({ depositLoan: true, loanRepayment: "BULLET", billingDay: 25, paymentAccountId: bank });

    const rules = await prisma.recurringRule.findMany({ where: { householdId: hid } });
    expect(rules).toHaveLength(1);
    const t = rules[0].template as unknown as RecurringTemplate;
    // 1억 × 3.6% / 12 = 30만원
    expect(t).toMatchObject({ type: "EXPENSE", amount: "300000", fromAccountId: bank, toAccountId: null });
    const cat = await prisma.category.findUniqueOrThrow({ where: { id: t.categoryId! } });
    expect(cat.name).toBe("대출이자");
    expect(rules[0].dayOfMonth).toBe(25);

    const { netWorth } = await getAccountOverview({ householdId: hid, userId: A }, "us", { today: todayKST(), monthStartDay: 1, trendMonths: 1 });
    expect(netWorth).toMatchObject({ assets: 5_000_000n, liabilities: 0n, netWorth: 5_000_000n, depositLoans: 100_000_000n });
  });

  it("보증금 대출이 아니면 부채로 순자산에서 빠진다", async () => {
    const r = await createAccount(loanInput({ name: "신용대출", openingBalance: "3000000", loanRepayment: "EQUAL_PAYMENT" }));
    expect(r.ok).toBe(true);
    const { netWorth } = await getAccountOverview({ householdId: hid, userId: A }, "us", { today: todayKST(), monthStartDay: 1, trendMonths: 1 });
    expect(netWorth).toMatchObject({ liabilities: 3_000_000n, netWorth: 2_000_000n });
  });

  it("이자 자동 기록은 만기일시상환만", async () => {
    const r = await createAccount(loanInput({ loanRepayment: "EQUAL_PAYMENT", autoInterest: true }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("만기일시상환") });
  });
});
