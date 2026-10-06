/**
 * DB 통합 테스트 — 공개범위·가구 격리 (PROD.MD AC-3, AC-4, AC-9)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db  (마이그레이션된 빈/테스트 DB 사용)
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAccountOverview } from "@/features/accounts/queries";
import { getMonthlySeries } from "@/features/dashboard/queries";
import { getAccounts, getScopedTransactions, getTransaction } from "@/features/ledger/queries";
import { materializeRecurring, resolveTxInput } from "@/features/ledger/service";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { moveHouseholdData } from "@/features/household/merge";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
const range = { start: "2026-01-01", end: "2027-01-01" };
let A: string, B: string, C: string;
let couple: string, other: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `b-${TAG}@test`, name: "B" } })).id;
  C = (await prisma.user.create({ data: { email: `c-${TAG}@test`, name: "C" } })).id;
  couple = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: couple, userId: B, role: "MEMBER" } });
  other = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "C", ownerUserId: C }), { timeout: 30_000 })).id;

  const acc = (householdId: string, ownerUserId: string | null, name: string, defaultVisibility: "SHARED" | "PRIVATE" = "SHARED") =>
    prisma.account.create({ data: { householdId, ownerUserId, name, type: "CHECKING", defaultVisibility } });
  ids.joint = (await acc(couple, null, "joint")).id;
  ids.aPrivateAcc = (await acc(couple, A, "a-secret", "PRIVATE")).id;
  ids.cAcc = (await acc(other, C, "c")).id;

  const food = await prisma.category.findFirstOrThrow({ where: { householdId: couple, name: "식비" } });
  ids.food = food.id;
  const tx = (createdByUserId: string, visibility: "SHARED" | "SUMMARY_ONLY" | "PRIVATE", amount: bigint, householdId = couple, from = ids.joint) =>
    prisma.transaction.create({
      data: {
        householdId, createdByUserId, type: "EXPENSE", date: toDbDate("2026-10-10"), amount,
        fromAccountId: from, categoryId: householdId === couple ? food.id : null, visibility, merchant: `m-${amount}`,
      },
    });
  ids.shared = (await tx(A, "SHARED", 1000n)).id;
  ids.summary = (await tx(A, "SUMMARY_ONLY", 2000n)).id;
  ids.private = (await tx(A, "PRIVATE", 4000n)).id;
  ids.bShared = (await tx(B, "SHARED", 8000n)).id;
  ids.cTx = (await tx(C, "SHARED", 16000n, other, ids.cAcc)).id;
}, 60_000);

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: { in: [couple, other] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

const ctxB = () => ({ householdId: couple, userId: B });

describe("AC-3 PRIVATE", () => {
  it("B의 어떤 조회에도 A의 PRIVATE 거래가 없다 (목록·합계)", async () => {
    for (const scope of ["us", "me", "partner"] as const) {
      const { items, summarized } = await getScopedTransactions(ctxB(), range, scope);
      expect(items.map((t) => t.id)).not.toContain(ids.private);
      expect([...items, ...summarized].some((t) => t.amount === 4000n)).toBe(false);
    }
    const series = await getMonthlySeries(ctxB(), "us", { endMonth: "2026-10", count: 1, monthStartDay: 1 });
    expect(series[0].stats.expense).toBe(1000n + 2000n + 8000n);
    expect(await getTransaction(ctxB(), ids.private)).toBeNull();
  });

  it("A의 PRIVATE 계좌는 B에게 존재 자체가 숨겨지고, B가 그 계좌로 거래를 쓸 수도 없다", async () => {
    const accounts = await getAccounts(ctxB(), "us");
    expect(accounts.map((a) => a.id)).not.toContain(ids.aPrivateAcc);
    const overview = await getAccountOverview(ctxB(), "us", { today: "2026-10-31", monthStartDay: 1, trendMonths: 1 });
    expect(overview.accounts.map((a) => a.id)).not.toContain(ids.aPrivateAcc);
    const r = await resolveTxInput(ctxB(), {
      type: "EXPENSE", date: "2026-10-11", amount: "100", fromAccountId: ids.aPrivateAcc, toAccountId: null,
      categoryId: ids.food, merchant: null, memo: null, visibility: null, isFixed: false,
    });
    expect(r.ok).toBe(false);
  });
});

describe("AC-4 SUMMARY_ONLY", () => {
  it("B에게 합계로만 — 목록·단건 조회에는 없음", async () => {
    const { items, summarized } = await getScopedTransactions(ctxB(), range, "us");
    expect(items.map((t) => t.id)).not.toContain(ids.summary);
    expect(summarized).toHaveLength(1);
    expect(summarized[0]).not.toHaveProperty("merchant");
    expect(summarized[0]).not.toHaveProperty("id");
    expect(await getTransaction(ctxB(), ids.summary)).toBeNull();
  });
});

describe("AC-9 가구 격리", () => {
  it("다른 가구의 거래 ID 로 조회하면 null", async () => {
    expect(await getTransaction(ctxB(), ids.cTx)).toBeNull();
    expect(await getTransaction({ householdId: other, userId: C }, ids.shared)).toBeNull();
  });
  it("다른 가구의 계좌·카테고리로는 거래를 만들 수 없다", async () => {
    const r = await resolveTxInput(ctxB(), {
      type: "EXPENSE", date: "2026-10-11", amount: "100", fromAccountId: ids.cAcc, toAccountId: null,
      categoryId: ids.food, merchant: null, memo: null, visibility: null, isFixed: false,
    });
    expect(r).toEqual({ ok: false, error: "계좌를 찾을 수 없습니다." });
  });
});

describe("정기 거래", () => {
  it("멱등: 두 번 실행해도 한 번만 생성", async () => {
    const rule = await prisma.recurringRule.create({
      data: {
        householdId: couple, createdByUserId: A, name: "월세",
        template: { type: "EXPENSE", amount: "500000", fromAccountId: ids.joint, toAccountId: null, categoryId: ids.food, merchant: null, memo: null, visibility: "SHARED" },
        dayOfMonth: 1, startDate: toDbDate("2026-08-01"),
      },
    });
    expect(await materializeRecurring(couple, "2026-10-06")).toBe(3);
    expect(await materializeRecurring(couple, "2026-10-06")).toBe(0);
    await prisma.recurringRule.update({ where: { id: rule.id }, data: { lastRunOn: null } });
    expect(await materializeRecurring(couple, "2026-10-06")).toBe(0); // (rule, date) 유니크로 중복 방지
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(3);
  });
});

describe("개인 가구 → 부부 가구 합류 (private 모드)", () => {
  it("데이터를 옮기고 카테고리를 이름으로 매핑, 공개범위는 PRIVATE", async () => {
    await prisma.$transaction((db) => moveHouseholdData(db, { fromHouseholdId: other, toHouseholdId: couple, userId: C, mode: "private" }), { timeout: 30_000 });
    const moved = await prisma.transaction.findUniqueOrThrow({ where: { id: ids.cTx } });
    expect(moved.householdId).toBe(couple);
    expect(moved.visibility).toBe("PRIVATE");
    const acc = await prisma.account.findUniqueOrThrow({ where: { id: ids.cAcc } });
    expect(acc).toMatchObject({ householdId: couple, defaultVisibility: "PRIVATE", ownerUserId: C });
  });
});
