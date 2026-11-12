/**
 * DB 통합 테스트 — 부부 정산(getSettlement)과 변경 이력(getHouseholdHistory)의 공개범위
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detachImpact, detachMember } from "@/features/admin/delete-user";
import { getHouseholdHistory } from "@/features/household/history";
import { getSettlement } from "@/features/reports/settlement";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
const households: string[] = [];

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

const user = (name: string) => prisma.user.create({ data: { email: `${name}-${TAG}@test`, name, approvedAt: new Date() } });

let a: { id: string; name: string };
let b: { id: string; name: string };
let hid: string;
let ctxA: Parameters<typeof getSettlement>[0];

beforeAll(async () => {
  [a, b] = await Promise.all([user("민수"), user("지영")]);
  const h = await prisma.household.create({
    data: { name: "부부", members: { create: [{ userId: a.id, role: "OWNER" }, { userId: b.id, role: "MEMBER" }] } },
  });
  hid = h.id;
  households.push(h.id);
  ctxA = {
    householdId: hid,
    userId: a.id,
    members: [
      { id: a.id, name: a.name, email: "", role: "OWNER" },
      { id: b.id, name: b.name, email: "", role: "MEMBER" },
    ],
    household: { id: hid, name: "부부", monthStartDay: 1, emergencyMonths: 3 },
  };
});

describe("부부 정산", () => {
  it("카드 명의자가 낸 사람, 공동 계좌·비공개 지출은 빠진다", async () => {
    const [cardA, joint, cardB] = await Promise.all([
      prisma.account.create({ data: { householdId: hid, name: "A카드", type: "CREDIT_CARD", ownerUserId: a.id } }),
      prisma.account.create({ data: { householdId: hid, name: "공동통장", type: "CHECKING", ownerUserId: null } }),
      prisma.account.create({ data: { householdId: hid, name: "B카드", type: "CREDIT_CARD", ownerUserId: b.id } }),
    ]);
    const tx = (data: { amount: bigint; fromAccountId?: string; createdByUserId: string; visibility?: "SHARED" | "PRIVATE" | "SUMMARY_ONLY"; type?: "EXPENSE" | "INCOME"; toAccountId?: string }) =>
      prisma.transaction.create({
        data: {
          householdId: hid,
          type: data.type ?? "EXPENSE",
          date: toDbDate("2026-09-10"),
          amount: data.amount,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          createdByUserId: data.createdByUserId,
          paidByUserId: data.createdByUserId,
          visibility: data.visibility ?? "SHARED",
        },
      });
    await Promise.all([
      // B 가 A 카드로 기록해도 낸 사람은 카드 명의자 A
      tx({ amount: 300_000n, fromAccountId: cardA.id, createdByUserId: b.id }),
      tx({ amount: 100_000n, fromAccountId: cardB.id, createdByUserId: b.id, visibility: "SUMMARY_ONLY" }),
      tx({ amount: 500_000n, fromAccountId: joint.id, createdByUserId: a.id }),
      tx({ amount: 999_000n, fromAccountId: cardB.id, createdByUserId: b.id, visibility: "PRIVATE" }),
      // 계좌 없는 현금 지출 → 기록한 사람
      tx({ amount: 20_000n, createdByUserId: b.id }),
    ]);

    const s = await getSettlement(ctxA, "2026-09");
    expect(s).not.toBeNull();
    expect(s!.result.jointPaid).toBe(500_000n);
    expect(s!.result.paid).toEqual({ [a.id]: 300_000n, [b.id]: 120_000n });
    expect(s!.result.transfer).toEqual({ from: b.id, to: a.id, amount: 90_000n });
    expect(s!.count).toBe(4);
  });

  it("수입 비율: 입금 계좌 명의자의 공개 수입으로 나눈다", async () => {
    const [accA, accB] = await Promise.all([
      prisma.account.create({ data: { householdId: hid, name: "A월급", type: "CHECKING", ownerUserId: a.id } }),
      prisma.account.create({ data: { householdId: hid, name: "B월급", type: "CHECKING", ownerUserId: b.id } }),
    ]);
    await prisma.transaction.createMany({
      data: [
        { householdId: hid, type: "INCOME", date: toDbDate("2026-09-25"), amount: 6_000_000n, toAccountId: accA.id, createdByUserId: a.id, visibility: "SHARED" },
        { householdId: hid, type: "INCOME", date: toDbDate("2026-09-25"), amount: 4_000_000n, toAccountId: accB.id, createdByUserId: a.id, visibility: "SHARED" },
      ],
    });
    await prisma.splitRule.create({ data: { householdId: hid, method: "INCOME_RATIO" } });
    const s = await getSettlement(ctxA, "2026-09");
    expect(s!.result.basisPointsA).toBe(6000);
    // 공동 지출 420,000 → A 252,000 / B 168,000. A 는 300,000 냈으니 B 가 48,000 보낸다
    expect(s!.result.transfer).toEqual({ from: b.id, to: a.id, amount: 48_000n });
  });
});

describe("변경 이력 공개범위", () => {
  it("배우자의 비공개 계좌에 관한 기록은 보이지 않고, 내 것은 보인다", async () => {
    const [privB, privA] = await Promise.all([
      prisma.account.create({ data: { householdId: hid, name: "B비상금", type: "SAVINGS", ownerUserId: b.id, defaultVisibility: "PRIVATE" } }),
      prisma.account.create({ data: { householdId: hid, name: "A비상금", type: "SAVINGS", ownerUserId: a.id, defaultVisibility: "PRIVATE" } }),
    ]);
    await prisma.auditLog.createMany({
      data: [
        { householdId: hid, userId: b.id, action: "ACCOUNT_UPDATE", entity: "Account", entityId: privB.id },
        { householdId: hid, userId: a.id, action: "ACCOUNT_UPDATE", entity: "Account", entityId: privA.id },
        { householdId: hid, userId: b.id, action: "ACCOUNT_DELETE", entity: "Account", entityId: "gone", diff: { name: "몰래통장" } },
      ],
    });
    const rows = await getHouseholdHistory(ctxA);
    const texts = rows.map((r) => `${r.actor}|${r.text}`);
    expect(texts.some((t) => t.includes("B비상금"))).toBe(false);
    expect(texts).toContain("나|계좌 'A비상금' 정보를 바꿨어요");
    // 배우자가 지운 계좌 이름은 보이지 않는다
    expect(texts).toContain("지영|계좌을(를) 지웠어요");
    expect(texts.some((t) => t.includes("몰래통장"))).toBe(false);
  });
});

describe("가구 나가기 (detachMember)", () => {
  it("영향 미리보기와 실제 정리가 같다", async () => {
    const [c, d] = await Promise.all([user("c"), user("d")]);
    const h = await prisma.household.create({
      data: { name: "나가기", members: { create: [{ userId: c.id, role: "OWNER" }, { userId: d.id, role: "MEMBER" }] } },
      include: { members: true },
    });
    households.push(h.id);
    const priv = await prisma.account.create({ data: { householdId: h.id, name: "c비공개", type: "CHECKING", ownerUserId: c.id, defaultVisibility: "PRIVATE" } });
    const pub = await prisma.account.create({ data: { householdId: h.id, name: "c공개", type: "CHECKING", ownerUserId: c.id } });
    await prisma.transaction.createMany({
      data: [
        { householdId: h.id, type: "EXPENSE", date: toDbDate("2026-09-01"), amount: 1n, fromAccountId: priv.id, createdByUserId: c.id, visibility: "PRIVATE" },
        { householdId: h.id, type: "EXPENSE", date: toDbDate("2026-09-01"), amount: 2n, fromAccountId: pub.id, createdByUserId: c.id, visibility: "SHARED" },
      ],
    });
    expect(await detachImpact(prisma, c.id, h.id)).toEqual({ privateAccounts: 1, privateTx: 1, ownAccounts: 1 });

    const dMember = h.members.find((m) => m.userId === d.id)!;
    await prisma.$transaction((db) => detachMember(db, { userId: c.id, householdId: h.id, partnerUserId: d.id, partnerMemberId: dMember.id, wasOwner: true }));
    expect(await prisma.account.findUnique({ where: { id: priv.id } })).toBeNull();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: pub.id } })).ownerUserId).toBeNull();
    expect((await prisma.householdMember.findUniqueOrThrow({ where: { id: dMember.id } })).role).toBe("OWNER");
    expect(await prisma.transaction.count({ where: { householdId: h.id } })).toBe(1);
  });
});
