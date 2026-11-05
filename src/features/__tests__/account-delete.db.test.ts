/**
 * DB 통합 테스트 — 보관한 계좌 삭제 (deleteAccount / getDeleteImpact)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// 서버 액션의 로그인 컨텍스트를 테스트 사용자로 바꿔 끼운다
const viewer = vi.hoisted(() => ({ userId: "", householdId: "" }));
vi.mock("@/lib/db/context", () => ({
  requireHousehold: async () => ({ userId: viewer.userId, householdId: viewer.householdId }),
  writeAudit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { deleteAccount, getDeleteImpact } from "@/features/accounts/actions";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let bank: string;

const rule = (createdByUserId: string, toAccountId: string) =>
  prisma.recurringRule.create({
    data: {
      householdId: hid,
      createdByUserId,
      name: "적금 납입",
      template: { type: "TRANSFER", amount: "100000", fromAccountId: bank, toAccountId, visibility: "SHARED" },
      dayOfMonth: 25,
      startDate: toDbDate("2026-11-01"),
    },
  });

const savings = (isArchived = true) =>
  prisma.account
    .create({ data: { householdId: hid, ownerUserId: A, name: `적금 ${TAG}`, type: "SAVINGS", isArchived } })
    .then((a) => a.id);

const tx = (accountId: string, deletedAt: Date | null = null) =>
  prisma.transaction.create({
    data: {
      householdId: hid,
      createdByUserId: A,
      type: "TRANSFER",
      amount: 100_000n,
      date: toDbDate("2026-11-01"),
      fromAccountId: bank,
      toAccountId: accountId,
      visibility: "SHARED",
      deletedAt,
    },
  });

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `del-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `del-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  bank = (await prisma.account.create({ data: { householdId: hid, ownerUserId: A, name: "A 통장", type: "CHECKING" } })).id;
});

beforeEach(() => {
  viewer.userId = A;
  viewer.householdId = hid;
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("보관한 계좌 삭제", () => {
  it("보관하지 않은 계좌는 지울 수 없다", async () => {
    const id = await savings(false);
    expect(await deleteAccount(id)).toMatchObject({ ok: false, error: expect.stringContaining("보관한 계좌만") });
    expect(await prisma.account.count({ where: { id } })).toBe(1);
  });

  it("거래가 남아 있으면 지울 수 없다 — 과거 리포트 보존", async () => {
    const id = await savings();
    await tx(id);
    expect(await getDeleteImpact(id)).toMatchObject({ ok: true, data: { transactions: 1 } });
    expect(await deleteAccount(id)).toMatchObject({ ok: false, error: expect.stringContaining("거래 1건") });
    expect(await prisma.account.count({ where: { id } })).toBe(1);
  });

  it("배우자가 만든 자동이체가 걸려 있으면 지울 수 없다", async () => {
    const id = await savings();
    await rule(B, id);
    expect(await getDeleteImpact(id)).toMatchObject({ ok: true, data: { transactions: 0, myRules: 0, otherRules: 1 } });
    expect(await deleteAccount(id)).toMatchObject({ ok: false, error: expect.stringContaining("배우자") });
    expect(await prisma.account.count({ where: { id } })).toBe(1);
  });

  it("다른 가구의 계좌는 찾을 수 없다", async () => {
    const id = await savings();
    viewer.householdId = "other-household";
    expect(await deleteAccount(id)).toMatchObject({ ok: false, error: "계좌를 찾을 수 없어요." });
    expect(await prisma.account.count({ where: { id } })).toBe(1);
  });

  it("거래 0건이면 지우고, 휴지통 거래·내 자동이체·목표 연결을 함께 정리한다", async () => {
    const id = await savings();
    const trashed = await tx(id, new Date());
    const mine = await rule(A, id);
    const goal = await prisma.assetGoal.create({
      data: { householdId: hid, name: "목돈", targetAmount: 10_000_000n, targetDate: toDbDate("2028-01-01"), priority: 1, linkedAccountIds: [id, bank] },
    });

    expect(await getDeleteImpact(id)).toMatchObject({ ok: true, data: { transactions: 0, myRules: 1, otherRules: 0 } });
    expect(await deleteAccount(id)).toEqual({ ok: true });

    expect(await prisma.account.count({ where: { id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { id: trashed.id } })).toBe(0);
    expect(await prisma.recurringRule.count({ where: { id: mine.id } })).toBe(0);
    expect((await prisma.assetGoal.findUniqueOrThrow({ where: { id: goal.id } })).linkedAccountIds).toEqual([bank]);
    // 출금 쪽 통장은 그대로
    expect(await prisma.account.count({ where: { id: bank } })).toBe(1);
  });
});
