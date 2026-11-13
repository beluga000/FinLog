/**
 * DB 통합 테스트 — 즐겨찾기(A3), 지운 기록 되살리기(B1), 휴지통·30일 정리(B2)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ userId: "", householdId: "" }));
vi.mock("@/lib/db/context", () => ({
  requireHousehold: async () => ({ userId: viewer.userId, householdId: viewer.householdId, household: { monthStartDay: 1 } }),
  writeAudit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

import { deleteTransaction, restoreTransaction } from "@/features/ledger/actions";
import { addFavoriteFromTransaction, deleteFavorite, getFavorites, recordFavorite } from "@/features/ledger/favorites";
import { getDeletedTransactions, TRASH_DAYS } from "@/features/ledger/queries";
import { purgeDeletedTransactions } from "@/features/ledger/service";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { todayKST } from "@/lib/finance/period";

const TAG = `t${Date.now()}`;
const DAY = 86_400_000;
let A: string;
let B: string;
let hid: string;
let card: string;
let food: string;

const as = (userId: string) => {
  viewer.userId = userId;
  viewer.householdId = hid;
};
const expense = (createdByUserId: string, visibility: "SHARED" | "SUMMARY_ONLY" | "PRIVATE" = "SHARED", deletedAt: Date | null = null) =>
  prisma.transaction.create({
    data: {
      householdId: hid,
      createdByUserId,
      type: "EXPENSE",
      date: toDbDate("2026-11-03"),
      amount: 9_000n,
      merchant: "김밥천국",
      memo: "점심",
      categoryId: food,
      fromAccountId: card,
      visibility,
      deletedAt,
    },
  });

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `fav-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `fav-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  card = (await prisma.account.create({ data: { householdId: hid, name: "카드", type: "CREDIT_CARD" } })).id;
  food = (await prisma.category.findFirstOrThrow({ where: { householdId: hid, name: "식비", txType: "EXPENSE" } })).id;
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("지운 기록 되살리기 (B1)", () => {
  it("지운 기록을 되살리면 가계부에 다시 나온다", async () => {
    as(A);
    const tx = await expense(A);
    expect((await deleteTransaction(tx.id)).ok).toBe(true);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).deletedAt).not.toBeNull();
    expect((await restoreTransaction(tx.id)).ok).toBe(true);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).deletedAt).toBeNull();
    // 두 번 되살릴 수 없다
    expect((await restoreTransaction(tx.id)).ok).toBe(false);
  });

  it("배우자의 공유 기록은 되살리고, 합계만·비공개 기록은 못 한다", async () => {
    const shared = await expense(A, "SHARED", new Date());
    const summary = await expense(A, "SUMMARY_ONLY", new Date());
    const hidden = await expense(A, "PRIVATE", new Date());
    as(B);
    expect((await restoreTransaction(shared.id)).ok).toBe(true);
    expect((await restoreTransaction(summary.id)).ok).toBe(false);
    expect((await restoreTransaction(hidden.id)).ok).toBe(false);
  });

  it("휴지통 기간이 지난 기록은 되살리지 않는다", async () => {
    as(A);
    const old = await expense(A, "SHARED", new Date(Date.now() - (TRASH_DAYS + 1) * DAY));
    expect((await restoreTransaction(old.id)).ok).toBe(false);
  });
});

describe("휴지통 (B2)", () => {
  it("최근 지운 기록 — 내 기록과 배우자 공유 기록만, 기간 안의 것만", async () => {
    const mine = await expense(B, "PRIVATE", new Date());
    const aShared = await expense(A, "SHARED", new Date());
    const aPrivate = await expense(A, "PRIVATE", new Date());
    const old = await expense(B, "SHARED", new Date(Date.now() - (TRASH_DAYS + 2) * DAY));
    const ids = (await getDeletedTransactions({ householdId: hid, userId: B })).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([mine.id, aShared.id]));
    expect(ids).not.toContain(aPrivate.id);
    expect(ids).not.toContain(old.id);
  });

  it("30일 지난 지운 기록만 완전히 지운다", async () => {
    const recent = await expense(A, "SHARED", new Date(Date.now() - (TRASH_DAYS - 1) * DAY));
    const expired = await expense(A, "SHARED", new Date(Date.now() - (TRASH_DAYS + 1) * DAY));
    const alive = await expense(A);
    await purgeDeletedTransactions();
    const left = new Set((await prisma.transaction.findMany({ where: { id: { in: [recent.id, expired.id, alive.id] } } })).map((t) => t.id));
    expect(left.has(recent.id)).toBe(true);
    expect(left.has(alive.id)).toBe(true);
    expect(left.has(expired.id)).toBe(false);
  });
});

describe("즐겨찾기 (A3)", () => {
  it("기록에서 만들고, 누르면 오늘 날짜로 같은 내용이 기록된다", async () => {
    as(A);
    const tx = await expense(A);
    const added = await addFavoriteFromTransaction(tx.id);
    expect(added.ok && !added.data?.existed).toBe(true);
    // 같은 내용은 하나만
    const again = await addFavoriteFromTransaction(tx.id);
    expect(again.ok && again.data?.existed).toBe(true);

    const [fav] = await getFavorites();
    expect(fav).toMatchObject({ name: "김밥천국", type: "EXPENSE", amount: "9000" });
    const rec = await recordFavorite(fav.id);
    expect(rec.ok).toBe(true);
    const created = await prisma.transaction.findUniqueOrThrow({ where: { id: rec.ok ? rec.data!.id : "" } });
    expect(created).toMatchObject({ amount: 9_000n, merchant: "김밥천국", memo: "점심", categoryId: food, fromAccountId: card, createdByUserId: A });
    expect(created.date.toISOString().slice(0, 10)).toBe(todayKST());
  });

  it("즐겨찾기는 사람마다 따로 — 배우자 것은 보이지도, 쓰지도, 지우지도 못한다", async () => {
    as(A);
    const [fav] = await getFavorites();
    as(B);
    expect(await getFavorites()).toEqual([]);
    expect((await recordFavorite(fav.id)).ok).toBe(false);
    expect((await deleteFavorite(fav.id)).ok).toBe(false);
  });

  it("배우자의 합계만 공개 기록으로는 만들 수 없고, 공유 기록으로 만들면 공개범위는 내 계좌 기본값", async () => {
    const summary = await expense(A, "SUMMARY_ONLY");
    const shared = await prisma.transaction.create({
      data: { householdId: hid, createdByUserId: A, type: "EXPENSE", date: toDbDate("2026-11-04"), amount: 4_500n, merchant: "스타벅스", categoryId: food, fromAccountId: card, visibility: "SHARED" },
    });
    as(B);
    expect((await addFavoriteFromTransaction(summary.id)).ok).toBe(false);
    expect((await addFavoriteFromTransaction(shared.id)).ok).toBe(true);
    const fav = await prisma.txFavorite.findFirstOrThrow({ where: { userId: B } });
    expect((fav.template as { visibility: unknown }).visibility).toBeNull();
  });

  it("지운 카테고리를 쓰는 즐겨찾기는 기록하지 않고 이유를 알려 준다", async () => {
    as(B);
    const fav = await prisma.txFavorite.findFirstOrThrow({ where: { userId: B } });
    await prisma.txFavorite.update({ where: { id: fav.id }, data: { template: { ...(fav.template as object), categoryId: "없는카테고리" } } });
    const before = await prisma.transaction.count({ where: { householdId: hid } });
    const r = await recordFavorite(fav.id);
    expect(r.ok).toBe(false);
    expect(await prisma.transaction.count({ where: { householdId: hid } })).toBe(before);
  });
});
