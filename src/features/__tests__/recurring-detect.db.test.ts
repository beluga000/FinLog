/**
 * DB 통합 테스트 — 정기 결제 찾기 (getRecurringCandidates, "아니에요", 등록하면 사라짐)
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
vi.mock("@/lib/finance/period", async (orig) => ({ ...(await orig<typeof import("@/lib/finance/period")>()), todayKST: () => TODAY }));

import { createRecurringRule, dismissRecurringCandidate } from "@/features/ledger/actions";
import { getRecurringCandidates } from "@/features/ledger/queries";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TODAY = "2026-11-10";
const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let card: string;

const spend = (userId: string, date: string, merchant: string, amount: bigint) =>
  prisma.transaction.create({
    data: {
      householdId: hid,
      createdByUserId: userId,
      type: "EXPENSE",
      date: toDbDate(date),
      amount,
      fromAccountId: card,
      merchant,
      visibility: "SHARED",
    },
  });

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `rd-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `rd-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  card = (await prisma.account.create({ data: { householdId: hid, name: "카드", type: "CREDIT_CARD", defaultVisibility: "SHARED" } })).id;
  viewer.userId = A;
  viewer.householdId = hid;
  for (const m of ["08", "09", "10", "11"]) {
    await spend(A, `2026-${m}-05`, "넷플릭스", 17_000n);
    await spend(A, `2026-${m}-03`, "유튜브 프리미엄", 14_900n);
    await spend(B, `2026-${m}-07`, "왓챠", 12_900n);
  }
  // 6달보다 오래된 기록은 보지 않는다
  for (const m of ["01", "02", "03"]) await spend(A, `2026-${m}-15`, "옛날 구독", 5_000n);
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

const names = async (userId = A) => (await getRecurringCandidates({ householdId: hid, userId }, TODAY)).map((c) => c.merchant);

describe("정기 결제 찾기", () => {
  it("내 기록에서만 찾는다 — 배우자 기록·6달 넘은 기록은 빼고, 큰 금액부터", async () => {
    expect(await names()).toEqual(["넷플릭스", "유튜브 프리미엄"]);
    expect(await names(B)).toEqual(["왓챠"]);
  });

  it("'아니에요'는 가구 공통으로 기억하고, 잘못된 키는 거절한다", async () => {
    const [netflix] = await getRecurringCandidates({ householdId: hid, userId: A }, TODAY);
    expect(await dismissRecurringCandidate(netflix.key)).toEqual({ ok: true });
    expect(await dismissRecurringCandidate(netflix.key)).toEqual({ ok: true });
    expect((await prisma.household.findUnique({ where: { id: hid } }))!.dismissedRecurring).toEqual([netflix.key]);
    expect(await names()).toEqual(["유튜브 프리미엄"]);
    expect((await dismissRecurringCandidate("SAVE_INVEST:x")).ok).toBe(false);
  });

  it("정기 거래로 등록하면 후보에서 사라지고, 이미 기록한 달은 다시 만들지 않는다", async () => {
    const [yt] = await getRecurringCandidates({ householdId: hid, userId: A }, TODAY);
    // 지출 규칙은 카테고리가 있어야 한다 — 기록에 없으면 입력 창에서 고른다
    const category = await prisma.category.findFirstOrThrow({ where: { householdId: hid, txType: "EXPENSE", parentId: null } });
    const r = await createRecurringRule({
      name: yt.merchant,
      tx: { type: "EXPENSE", amount: yt.amount.toString(), fromAccountId: yt.fromAccountId, toAccountId: null, categoryId: category.id, merchant: yt.merchant, memo: null, visibility: "SHARED", isFixed: false },
      dayOfMonth: yt.dayOfMonth,
      businessDayAdjust: "NONE",
      startDate: yt.startDate,
      endDate: null,
    });
    expect(r).toEqual({ ok: true, data: { created: 0 } });
    expect(await names()).toEqual([]);
  });
});
