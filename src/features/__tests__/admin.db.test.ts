/**
 * DB 통합 테스트 — 서비스 관리자의 계정 삭제 (deleteUserAccount)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, describe, expect, it } from "vitest";
import { deleteUserAccount } from "@/features/admin/delete-user";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
const households: string[] = [];

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

const user = (name: string) => prisma.user.create({ data: { email: `${name}-${TAG}@test`, name, approvedAt: new Date() } });

describe("계정 삭제", () => {
  it("혼자 쓰던 가구는 가구째 삭제", async () => {
    const u = await user("solo");
    const h = await prisma.household.create({ data: { name: "개인", members: { create: { userId: u.id, role: "OWNER" } } } });
    households.push(h.id);
    await prisma.account.create({ data: { householdId: h.id, name: "통장", type: "CHECKING", ownerUserId: u.id } });

    const r = await prisma.$transaction((db) => deleteUserAccount(db, u.id));
    expect(r.kind).toBe("household");
    expect(await prisma.household.findUnique({ where: { id: h.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("부부 가구: 비공개는 삭제, 공개 계좌는 공동으로, 정기 거래는 배우자에게, 관리자 승계", async () => {
    const [a, b] = await Promise.all([user("a"), user("b")]);
    const h = await prisma.household.create({
      data: { name: "부부", members: { create: [{ userId: a.id, role: "OWNER" }, { userId: b.id, role: "MEMBER" }] } },
    });
    households.push(h.id);
    const [shared, secret] = await Promise.all([
      prisma.account.create({ data: { householdId: h.id, name: "공개", type: "CHECKING", ownerUserId: a.id } }),
      prisma.account.create({ data: { householdId: h.id, name: "비밀", type: "CHECKING", ownerUserId: a.id, defaultVisibility: "PRIVATE" } }),
    ]);
    const tx = (accountId: string, visibility: "SHARED" | "PRIVATE") =>
      prisma.transaction.create({
        data: { householdId: h.id, createdByUserId: a.id, type: "EXPENSE", date: toDbDate("2026-11-01"), amount: 1000n, fromAccountId: accountId, visibility },
      });
    const [keep, hidden, onSecret] = await Promise.all([tx(shared.id, "SHARED"), tx(shared.id, "PRIVATE"), tx(secret.id, "SHARED")]);
    const tpl = (visibility: string) => ({ type: "EXPENSE", amount: "1000", fromAccountId: shared.id, toAccountId: null, categoryId: null, merchant: null, memo: null, visibility });
    const [pubRule, privRule] = await Promise.all([
      prisma.recurringRule.create({ data: { householdId: h.id, createdByUserId: a.id, name: "공개", template: tpl("SHARED"), dayOfMonth: 1, startDate: toDbDate("2026-11-01") } }),
      prisma.recurringRule.create({ data: { householdId: h.id, createdByUserId: a.id, name: "비공개", template: tpl("PRIVATE"), dayOfMonth: 1, startDate: toDbDate("2026-11-01") } }),
    ]);

    const r = await prisma.$transaction((db) => deleteUserAccount(db, a.id));
    expect(r).toEqual({ kind: "member", householdId: h.id, partnerId: b.id });

    expect(await prisma.transaction.findUnique({ where: { id: keep.id } })).not.toBeNull();
    expect(await prisma.transaction.findUnique({ where: { id: hidden.id } })).toBeNull();
    expect(await prisma.transaction.findUnique({ where: { id: onSecret.id } })).toBeNull();
    expect(await prisma.account.findUnique({ where: { id: secret.id } })).toBeNull();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: shared.id } })).ownerUserId).toBeNull();
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: pubRule.id } })).createdByUserId).toBe(b.id);
    expect(await prisma.recurringRule.findUnique({ where: { id: privRule.id } })).toBeNull();
    const members = await prisma.householdMember.findMany({ where: { householdId: h.id } });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: b.id, role: "OWNER" });
  });
});
