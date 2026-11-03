/**
 * DB 통합 테스트 — 카드 결제일·출금 계좌, 부부 계좌 관리 (PROD.MD Phase 1.7, AC-24~26)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCardDueItems, getReviewItems } from "@/features/dashboard/home";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let card: string;
let bank: string;

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `acc-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `acc-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });

  // B 명의 통장(잔액 50만) + B 명의 카드(미결제 80만, 15일 결제, 출금=통장) — A 가 대신 등록한 상황
  bank = (
    await prisma.account.create({
      data: {
        householdId: hid,
        ownerUserId: B,
        name: "B 생활비 통장",
        type: "CHECKING",
        snapshots: { create: { asOf: toDbDate("2026-11-01"), balance: 500_000n } },
      },
    })
  ).id;
  card = (
    await prisma.account.create({
      data: {
        householdId: hid,
        ownerUserId: B,
        name: "B 카드",
        type: "CREDIT_CARD",
        billingDay: 15,
        paymentAccountId: bank,
        snapshots: { create: { asOf: toDbDate("2026-11-01"), balance: -800_000n } },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("카드 결제 예정 (AC-25)", () => {
  it("결제일 5일 전부터 대금·출금 계좌 잔액과 함께 나온다 — 배우자에게도", async () => {
    expect(await getCardDueItems({ householdId: hid, userId: A }, { today: "2026-11-09" })).toEqual([]);
    for (const userId of [A, B]) {
      const [item] = await getCardDueItems({ householdId: hid, userId }, { today: "2026-11-12" });
      expect(item).toMatchObject({
        kind: "cardDue",
        date: "2026-11-15",
        card: { id: card, toPay: 800_000n },
        payment: { id: bank, balance: 500_000n },
      });
    }
    // 카드 결제는 기한이 있으므로 확인할 일 맨 앞
    expect((await getReviewItems({ householdId: hid, userId: A }, { today: "2026-11-12" }))[0]?.kind).toBe("cardDue");
  });

  it("출금 계좌를 내가 볼 수 없으면 계좌 정보는 빼고 알린다", async () => {
    await prisma.account.update({ where: { id: bank }, data: { defaultVisibility: "PRIVATE" } });
    const [item] = await getCardDueItems({ householdId: hid, userId: A }, { today: "2026-11-12" });
    expect(item).toMatchObject({ card: { id: card }, payment: null });
    await prisma.account.update({ where: { id: bank }, data: { defaultVisibility: "SHARED" } });
  });

  it("대금 이체(→카드)를 기록하면 사라진다", async () => {
    await prisma.transaction.create({
      data: {
        householdId: hid,
        type: "TRANSFER",
        amount: 800_000n,
        date: toDbDate("2026-11-15"),
        fromAccountId: bank,
        toAccountId: card,
        createdByUserId: A,
        visibility: "SHARED",
      },
    });
    expect(await getCardDueItems({ householdId: hid, userId: B }, { today: "2026-11-13" })).toEqual([]);
  });
});

describe("부부 계좌 관리 (AC-26)", () => {
  it("배우자 명의 평가액 계좌도 잔액 업데이트 알림이 나에게 온다", async () => {
    const inv = await prisma.account.create({
      data: {
        householdId: hid,
        ownerUserId: B,
        name: "B 증권",
        type: "INVESTMENT",
        snapshots: { create: { asOf: toDbDate("2026-09-01"), balance: 1_000_000n } },
      },
    });
    const items = await getReviewItems({ householdId: hid, userId: A }, { today: "2026-11-20" });
    expect(items.some((i) => i.kind === "balance" && i.account.id === inv.id)).toBe(true);
  });
});
