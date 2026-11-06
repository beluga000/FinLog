/**
 * DB 통합 테스트 — 이번 달 챌린지 (시작·진행 횟수·그만하기)
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
vi.mock("@/lib/finance/period", async (orig) => ({ ...(await orig<typeof import("@/lib/finance/period")>()), todayKST: () => "2026-11-10" }));

import { createHouseholdWithDefaults } from "@/features/household/setup";
import { getChallengeProgress } from "@/features/reports/challenge";
import { cancelChallenge, startChallenge } from "@/features/reports/challenge-actions";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
let A: string;
let B: string;
let hid: string;
let card: string;

const spend = (createdByUserId: string, merchant: string, date: string, visibility: "SHARED" | "PRIVATE" = "SHARED") =>
  prisma.transaction.create({
    data: { householdId: hid, createdByUserId, type: "EXPENSE", date: toDbDate(date), amount: 30_000n, merchant, fromAccountId: card, visibility },
  });

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `ch-a-${TAG}@test`, name: "A" } })).id;
  B = (await prisma.user.create({ data: { email: `ch-b-${TAG}@test`, name: "B" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "AB", ownerUserId: A }), { timeout: 30_000 })).id;
  await prisma.householdMember.create({ data: { householdId: hid, userId: B, role: "MEMBER" } });
  card = (await prisma.account.create({ data: { householdId: hid, name: "카드", type: "CREDIT_CARD" } })).id;
  viewer.userId = A;
  viewer.householdId = hid;
  await spend(A, "배달의민족", "2026-11-02");
  await spend(B, "배달의민족 ", "2026-11-05");
  await spend(B, "배달의민족", "2026-11-06", "PRIVATE");
  await spend(A, "배달의민족", "2026-10-30"); // 지난달
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("이번 달 챌린지", () => {
  it("지난달 8번 → 이번 달 4번까지, 같은 사용처는 한 번만", async () => {
    expect(await startChallenge({ merchant: "배달의민족", baselineCount: 8, baselineAmount: "259000" })).toEqual({ ok: true, data: { limitCount: 4 } });
    expect((await startChallenge({ merchant: "배달의 민족", baselineCount: 8, baselineAmount: "259000" })).ok).toBe(true);
    expect(await prisma.challenge.count({ where: { householdId: hid } })).toBe(1);
    expect((await startChallenge({ merchant: "네이버페이", baselineCount: 8, baselineAmount: "1" })).ok).toBe(false);
  });

  it("진행 횟수는 이번 달, 배우자 공개 지출까지 — 비공개는 세지 않는다", async () => {
    const [p] = await getChallengeProgress({ householdId: hid, userId: A }, { today: "2026-11-10", monthStartDay: 1 });
    expect(p).toMatchObject({ merchant: "배달의민족", limitCount: 4, count: 2 });
    // 배우자에게는 자기 비공개 지출도 보인다
    const [forB] = await getChallengeProgress({ householdId: hid, userId: B }, { today: "2026-11-10", monthStartDay: 1 });
    expect(forB.count).toBe(3);
  });

  it("그만하기 — 다른 가구는 못 지운다", async () => {
    const [p] = await getChallengeProgress({ householdId: hid, userId: A }, { today: "2026-11-10", monthStartDay: 1 });
    viewer.householdId = "other";
    expect((await cancelChallenge(p.id)).ok).toBe(false);
    viewer.householdId = hid;
    expect((await cancelChallenge(p.id)).ok).toBe(true);
    expect(await getChallengeProgress({ householdId: hid, userId: A }, { today: "2026-11-10", monthStartDay: 1 })).toEqual([]);
  });
});
