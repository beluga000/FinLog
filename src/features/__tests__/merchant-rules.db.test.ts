/**
 * DB 통합 테스트 — 가맹점 → 카테고리 규칙 (가구 공유), 캡처 점검의 규칙·거의 같은 금액 중복
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ userId: "", householdId: "" }));
vi.mock("@/lib/db/context", () => ({
  requireHousehold: async () => ({ userId: viewer.userId, householdId: viewer.householdId }),
  writeAudit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

import { deleteMerchantRule, getMerchantRules, inspectCapturedExpenses, saveMerchantRule } from "@/features/ledger/actions";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let card: string;
let food: string;
let living: string;
let snack: string;

const as = (userId: string) => {
  viewer.userId = userId;
  viewer.householdId = hid;
};
const expense = (createdByUserId: string, merchant: string, categoryId: string, amount = 10_000n, date = "2026-11-03") =>
  prisma.transaction.create({
    data: { householdId: hid, createdByUserId, type: "EXPENSE", date: toDbDate(date), amount, merchant, categoryId, fromAccountId: card, visibility: "SHARED" },
  });

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `mr-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `mr-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  card = (await prisma.account.create({ data: { householdId: hid, name: "카드", type: "CREDIT_CARD" } })).id;
  const cat = async (name: string) => (await prisma.category.findFirstOrThrow({ where: { householdId: hid, name, txType: "EXPENSE" } })).id;
  [food, living, snack] = await Promise.all([cat("식비"), cat("생활용품"), cat("카페·간식")]);
  // 캡처로 넣은 마라탕이 생활용품으로 쌓인 상황 — A 두 건, B 한 건
  await expense(A, "탕화콩푸마라탕", living);
  await expense(A, "탕화콩푸마라탕", living, 12_000n, "2026-11-04");
  await expense(B, "탕화콩푸마라탕", living, 9_000n);
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("가맹점 규칙", () => {
  it("규칙을 만들면 내가 쓴 지난 기록만 바뀌고, 배우자 기록 창에도 보인다", async () => {
    as(A);
    expect(await saveMerchantRule({ merchant: "탕화콩푸마라탕", categoryId: food, applyToPast: true })).toEqual({ ok: true, data: { updated: 2 } });
    const rows = await prisma.transaction.findMany({ where: { householdId: hid, merchant: "탕화콩푸마라탕" }, select: { createdByUserId: true, categoryId: true } });
    expect(rows.filter((r) => r.createdByUserId === A).every((r) => r.categoryId === food)).toBe(true);
    expect(rows.find((r) => r.createdByUserId === B)?.categoryId).toBe(living);

    as(B);
    expect((await getMerchantRules()).map((r) => [r.merchant, r.categoryId])).toEqual([["탕화콩푸마라탕", food]]);
  });

  it("같은 가맹점은 덮어쓰고, 네이버페이·다른 가구 카테고리는 거절", async () => {
    as(B);
    expect((await saveMerchantRule({ merchant: "탕화 콩푸 마라탕", categoryId: snack })).ok).toBe(true);
    expect(await getMerchantRules()).toHaveLength(1);
    expect((await saveMerchantRule({ merchant: "네이버페이", categoryId: food })).ok).toBe(false);
    const other = await prisma.category.findFirstOrThrow({ where: { NOT: { householdId: hid }, txType: "EXPENSE" } });
    expect((await saveMerchantRule({ merchant: "어딘가", categoryId: other.id })).ok).toBe(false);
  });

  it("캡처 점검: 규칙이 지난 기록보다 먼저, 처음 보는 편의점은 브랜드로", async () => {
    as(A);
    const [mala, gs] = await inspectCapturedExpenses([
      { amount: "11000", date: "2026-11-05", merchant: "탕화콩푸마라탕" },
      { amount: "3000", date: "2026-11-05", merchant: "GS25문정현대A동점" },
    ]);
    expect(mala.categoryId).toBe(snack);
    expect(gs.categoryId).toBe(snack);
  });

  it("같은 날 같은 가맹점, 금액이 거의 같으면 중복 의심", async () => {
    as(A);
    const [near, far] = await inspectCapturedExpenses([
      { amount: "10100", date: "2026-11-03", merchant: "탕화콩푸마라탕" },
      { amount: "20000", date: "2026-11-03", merchant: "탕화콩푸마라탕" },
    ]);
    expect(near.duplicate).toMatchObject({ amount: 10_000n, date: "2026-11-03" });
    expect(far.duplicate).toBeNull();
  });

  it("지우기 — 다른 가구 규칙은 못 지운다", async () => {
    as(A);
    const [rule] = await getMerchantRules();
    viewer.householdId = "other";
    expect((await deleteMerchantRule(rule.id)).ok).toBe(false);
    as(A);
    expect((await deleteMerchantRule(rule.id)).ok).toBe(true);
    expect(await getMerchantRules()).toEqual([]);
  });
});
