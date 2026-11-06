/**
 * DB 통합 테스트 — 올해 절세 한도 (자산 화면)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTaxRoom } from "@/features/accounts/tax";
import { getReviewItems } from "@/features/dashboard/home";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
const today = "2026-11-06";
let A: string, B: string, hid: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `ta-${TAG}@test`, name: "민수" } })).id;
  B = (await prisma.user.create({ data: { email: `tb-${TAG}@test`, name: "지영" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "절세", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });

  const acc = (data: { name: string; type: "CHECKING" | "INVESTMENT" | "PENSION"; ownerUserId: string; taxWrapper?: string; defaultVisibility?: "SHARED" | "PRIVATE" }) =>
    prisma.account.create({ data: { householdId: hid, ...data } }).then((a) => a.id);
  ids.bank = await acc({ name: "급여", type: "CHECKING", ownerUserId: A });
  ids.isa = await acc({ name: "ISA", type: "INVESTMENT", ownerUserId: A, taxWrapper: "ISA" });
  ids.pension = await acc({ name: "연금저축", type: "PENSION", ownerUserId: A, taxWrapper: "PENSION_SAVINGS" });
  ids.bIrp = await acc({ name: "지영 IRP", type: "PENSION", ownerUserId: B, taxWrapper: "IRP" });
  ids.plain = await acc({ name: "일반 증권", type: "INVESTMENT", ownerUserId: A });

  const tx = (by: string, type: "SAVE_INVEST" | "TRANSFER" | "ADJUSTMENT", to: string, amount: bigint, date: string, visibility: "SHARED" | "PRIVATE" = "SHARED") =>
    prisma.transaction.create({
      data: {
        householdId: hid,
        createdByUserId: by,
        type,
        date: toDbDate(date),
        amount,
        fromAccountId: type === "ADJUSTMENT" ? null : ids.bank,
        toAccountId: to,
        visibility,
      },
    });
  await tx(A, "SAVE_INVEST", ids.isa, 10_000_000n, "2026-03-02");
  await tx(A, "SAVE_INVEST", ids.isa, 2_000_000n, "2026-10-02");
  await tx(A, "SAVE_INVEST", ids.isa, 5_000_000n, "2025-12-30"); // 작년 — 빠진다
  await tx(A, "ADJUSTMENT", ids.isa, 900_000n, "2026-10-28"); // 평가이익 — 납입 아님
  await tx(A, "TRANSFER", ids.pension, 3_600_000n, "2026-06-01");
  await tx(A, "SAVE_INVEST", ids.plain, 7_000_000n, "2026-06-01"); // 세제 혜택 계좌 아님
  await tx(B, "SAVE_INVEST", ids.bIrp, 1_000_000n, "2026-05-01");
  await tx(B, "SAVE_INVEST", ids.bIrp, 2_000_000n, "2026-07-01", "PRIVATE"); // 지영 비공개 — 민수에게는 안 보인다
}, 60_000);

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

const ctxOf = (userId: string, partnerId: string) => ({
  householdId: hid,
  userId,
  user: { id: userId, name: userId === A ? "민수" : "지영" },
  partner: { id: partnerId, name: partnerId === A ? "민수" : "지영" },
  isCouple: true,
});

describe("getTaxRoom", () => {
  it("올해 세제 혜택 계좌 납입만 명의별로 (작년·평가이익·일반 계좌 제외, 내가 먼저)", async () => {
    const room = await getTaxRoom(ctxOf(A, B) as never, { today });
    expect(room?.year).toBe(2026);
    expect(room?.daysLeft).toBe(56);
    expect(room?.rows.map((r) => r.ownerLabel)).toEqual(["민수", "지영"]);
    const [me, partner] = room!.rows;
    expect(me.isa).toEqual({ paid: 12_000_000, room: 8_000_000 });
    expect(me.pension).toMatchObject({ savings: 3_600_000, irp: 0, credited: 3_600_000, room: 5_400_000 });
    // 배우자 비공개 납입은 내 화면 합계에서 빠진다
    expect(partner.pension).toMatchObject({ irp: 1_000_000, credited: 1_000_000 });
    expect(partner.isa).toBeNull();
  });

  it("배우자 본인에게는 자기 비공개 납입까지", async () => {
    const room = await getTaxRoom(ctxOf(B, A) as never, { today });
    expect(room?.rows[0].ownerLabel).toBe("지영");
    expect(room?.rows[0].pension).toMatchObject({ irp: 3_000_000 });
  });

  it("세제 혜택 계좌가 없으면 null", async () => {
    expect(await getTaxRoom({ householdId: "none", userId: A, user: { id: A, name: "x" }, partner: null, isCouple: false } as never, { today })).toBeNull();
  });
});

describe("총급여 구간 · 12월 연금 공제 알림", () => {
  it("구간은 명의자 것을 쓴다", async () => {
    await prisma.user.update({ where: { id: A }, data: { salaryBand: "UNDER" } });
    const room = await getTaxRoom(ctxOf(B, A) as never, { today });
    expect(room?.rows.map((r) => [r.ownerLabel, r.salaryBand])).toEqual([
      ["지영", null],
      ["민수", "UNDER"],
    ]);
  });

  it("12월 첫 주·마지막 열흘에 내 남은 한도만, 구간이 있으면 한 숫자", async () => {
    const ctx = { householdId: hid, userId: A };
    expect((await getReviewItems(ctx, { today: "2026-12-10" })).some((i) => i.kind === "taxDeadline")).toBe(false);
    const items = await getReviewItems(ctx, { today: "2026-12-20" });
    expect(items.find((i) => i.kind === "taxDeadline")).toMatchObject({
      date: "2026-12-31",
      room: 5_400_000,
      refundOne: Math.round(5_400_000 * 0.165),
    });
  });
});
