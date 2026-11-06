/**
 * DB 통합 테스트 — 잔액 한 번에 맞추기 (recordBalances, 확인할 일 묶음·월급날)
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
// recordBalances 는 오늘 날짜로 기록한다 — 테스트 날짜에 고정
vi.mock("@/lib/finance/period", async (orig) => ({ ...(await orig<typeof import("@/lib/finance/period")>()), todayKST: () => "2026-11-26" }));

import { recordBalances } from "@/features/accounts/actions";
import { getReconcileAccounts } from "@/features/accounts/queries";
import { getReviewItems, getStaleBalanceAccounts } from "@/features/dashboard/home";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let isa: string;
let jeonse: string;
let card: string;
let privateB: string;

const account = (data: { name: string; type: "INVESTMENT" | "REAL_ESTATE" | "CREDIT_CARD" | "CHECKING"; balance: bigint; asOf: string; ownerUserId?: string; defaultVisibility?: "PRIVATE"; balanceCheckYearly?: boolean }) =>
  prisma.account
    .create({
      data: {
        householdId: hid,
        name: data.name,
        type: data.type,
        ownerUserId: data.ownerUserId ?? null,
        defaultVisibility: data.defaultVisibility ?? "SHARED",
        balanceCheckYearly: data.balanceCheckYearly ?? false,
        snapshots: { create: { asOf: toDbDate(data.asOf), balance: data.balance } },
      },
    })
    .then((a) => a.id);

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `rc-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `rc-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  viewer.userId = A;
  viewer.householdId = hid;

  isa = await account({ name: "ISA", type: "INVESTMENT", balance: 24_562_700n, asOf: "2026-05-31" });
  jeonse = await account({ name: "전세보증금", type: "REAL_ESTATE", balance: 250_000_000n, asOf: "2026-05-31", balanceCheckYearly: true });
  card = await account({ name: "카드", type: "CREDIT_CARD", balance: -2_721_400n, asOf: "2026-11-01" });
  privateB = await account({ name: "B 비밀 통장", type: "CHECKING", balance: 1n, asOf: "2026-11-01", ownerUserId: B, defaultVisibility: "PRIVATE" });
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("잔액 한 번에 맞추기", () => {
  it("1년에 한 번 계좌는 30일이 지나도 낡은 계좌가 아니다", async () => {
    const stale = await getStaleBalanceAccounts({ householdId: hid, userId: A }, { today: "2026-11-20" });
    expect(stale.map((s) => s.id)).toEqual([isa]);
  });

  it("월급날 직후면 계좌별 줄 대신 '한 번에 맞추기' 한 줄", async () => {
    // 월급날 전: 낡은 계좌가 하나뿐이라 계좌 줄 그대로
    const before = await getReviewItems({ householdId: hid, userId: A }, { today: "2026-11-20" });
    expect(before.map((i) => i.kind)).toEqual(["balance"]);

    await prisma.recurringRule.create({
      data: {
        householdId: hid,
        createdByUserId: A,
        name: "월급",
        dayOfMonth: 25,
        startDate: toDbDate("2026-01-01"),
        template: { type: "INCOME", amount: "3000000", fromAccountId: null, toAccountId: null, categoryId: null, merchant: null, memo: null, visibility: "SHARED" },
      },
    });
    const after = await getReviewItems({ householdId: hid, userId: A }, { today: "2026-11-26" });
    expect(after).toEqual([expect.objectContaining({ kind: "reconcile", payday: "2026-11-25", stale: 1 })]);
  });

  it("배우자 비공개 계좌는 보이지 않고, 넘겨도 저장하지 않는다", async () => {
    const rows = await getReconcileAccounts({ householdId: hid, userId: A }, { today: "2026-11-26" });
    expect(rows.map((r) => r.id).sort()).toEqual([isa, jeonse, card].sort());
    const r = await recordBalances([{ id: privateB, balance: "0", yearly: false }]);
    expect(r.ok).toBe(false);
  });

  it("고친 계좌·그대로인 계좌 모두 오늘 날짜로 남기고, 건너뛴 계좌는 두고, 1년 확인을 바꾼다", async () => {
    const r = await recordBalances([
      { id: isa, balance: "25180000", yearly: false },
      { id: card, balance: "2721400", yearly: false },
      { id: jeonse, balance: null, yearly: false },
    ]);
    expect(r).toEqual({ ok: true, data: { saved: 2 } });

    const snaps = await prisma.accountSnapshot.findMany({ where: { accountId: { in: [isa, card, jeonse] } }, orderBy: { asOf: "desc" } });
    const latest = (id: string) => snaps.find((s) => s.accountId === id)!;
    expect(fromDbDate(latest(isa).asOf)).toBe("2026-11-26");
    expect(latest(isa).balance).toBe(25_180_000n);
    // 카드는 갚을 돈을 양수로 입력 → 음수로 저장
    expect(latest(card).balance).toBe(-2_721_400n);
    expect(fromDbDate(latest(jeonse).asOf)).toBe("2026-05-31");
    expect((await prisma.account.findUniqueOrThrow({ where: { id: jeonse } })).balanceCheckYearly).toBe(false);

    // 맞춘 뒤에는 월급날 줄이 사라진다
    const items = await getReviewItems({ householdId: hid, userId: A }, { today: "2026-11-26" });
    expect(items.some((i) => i.kind === "reconcile")).toBe(false);
  });
});
