/**
 * DB 통합 테스트 — 목표의 "이미 모은 돈" 기준 (시작 금액·기준 잔액)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ userId: "", householdId: "" }));
vi.mock("@/lib/db/context", () => ({
  requireHousehold: async () => ({ userId: viewer.userId, householdId: viewer.householdId }),
  writeAudit: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getArchiveImpact, setAccountArchived } from "@/features/accounts/actions";
import { createGoal, dismissGoalMilestone, setGoalStartAmount, updateGoal } from "@/features/goals/actions";
import { createHouseholdWithDefaults } from "@/features/household/setup";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { goalCurrent } from "@/lib/finance/goals";
import { todayKST } from "@/lib/finance/period";

const TAG = `t${Date.now()}`;
let A: string;
let hid: string;
let sav: string;
let sav2: string;

const account = async (name: string, type: "CHECKING" | "SAVINGS", balance: bigint) => {
  const a = await prisma.account.create({ data: { householdId: hid, ownerUserId: A, name: `${name} ${TAG}`, type } });
  await prisma.accountSnapshot.create({ data: { accountId: a.id, asOf: toDbDate("2026-01-01"), balance } });
  return a.id;
};

const goalInput = (over: Partial<Record<string, unknown>> = {}) => ({
  name: "결혼 자금",
  targetAmount: "50000000",
  targetIsReal: false,
  targetDate: "2030-01-01",
  expectedReturn: 0,
  linkedAccountIds: [sav],
  monthlyCommit: null,
  startAmount: "0",
  ...over,
});

const load = (id: string) => prisma.assetGoal.findUniqueOrThrow({ where: { id } });
const balances = new Map<string, number>();
const currentOf = (g: { startAmount: bigint; baseBalance: bigint; linkedAccountIds: string[] }) =>
  goalCurrent(
    { startAmount: Number(g.startAmount), baseBalance: Number(g.baseBalance) },
    g.linkedAccountIds.filter((id) => balances.has(id)).reduce((s, id) => s + balances.get(id)!, 0),
  );

beforeAll(async () => {
  A = (await prisma.user.create({ data: { email: `goal-a-${TAG}@test`, name: "A" } })).id;
  hid = (await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "A", ownerUserId: A }), { timeout: 30_000 })).id;
  await account("통장", "CHECKING", 10_000_000n);
  sav = await account("예적금", "SAVINGS", 30_000_000n);
  sav2 = await account("청약", "SAVINGS", 5_000_000n);
  balances.set(sav, 30_000_000).set(sav2, 5_000_000);
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

describe("목표 만들기 — 기존 잔액을 통째로 세지 않는다", () => {
  it("시작 금액 0: 3천만 원 계좌를 골라도 모인 돈 0원, 기준일은 오늘", async () => {
    const r = await createGoal(goalInput());
    expect(r.ok).toBe(true);
    const g = await load(r.ok ? r.data!.id : "");
    expect(g.startAmount).toBe(0n);
    expect(g.baseBalance).toBe(30_000_000n);
    expect(g.baseSetOn?.toISOString().slice(0, 10)).toBe(todayKST());
    expect(currentOf(g)).toBe(0);
  });

  it("잔액보다 많이 적으면 잔액으로 맞추고, 이미 넘은 진행률 단계는 본 것으로 둔다", async () => {
    const r = await createGoal(goalInput({ startAmount: "40000000" }));
    const g = await load(r.ok ? r.data!.id : "");
    expect(g.startAmount).toBe(30_000_000n);
    expect(g.milestoneSeen).toBe(50); // 30/50 = 60%
  });

  it("수정하면 보낸 금액을 오늘 기준으로 다시 잡는다", async () => {
    const r = await createGoal(goalInput({ startAmount: "1000000" }));
    const id = r.ok ? r.data!.id : "";
    expect(await updateGoal(id, goalInput({ name: "결혼", startAmount: "2000000" }))).toEqual({ ok: true });
    const g = await load(id);
    expect(g.name).toBe("결혼");
    expect(g.startAmount).toBe(2_000_000n);
  });
});

describe("이미 모은 돈만 바로 고치기", () => {
  it("시작 금액만 바꾸고 기준 잔액은 오늘 잔액", async () => {
    const r = await createGoal(goalInput());
    const id = r.ok ? r.data!.id : "";
    expect(await setGoalStartAmount(id, "5000000")).toEqual({ ok: true, data: { startAmount: 5_000_000 } });
    const g = await load(id);
    expect(g.startAmount).toBe(5_000_000n);
    expect(g.baseBalance).toBe(30_000_000n);
    expect(currentOf(g)).toBe(5_000_000);
  });

  it("숫자가 아니면 거부, 다른 가구 목표는 못 찾는다", async () => {
    const r = await createGoal(goalInput());
    const id = r.ok ? r.data!.id : "";
    expect(await setGoalStartAmount(id, "abc")).toMatchObject({ ok: false });
    viewer.householdId = "other";
    expect(await setGoalStartAmount(id, "1")).toMatchObject({ ok: false, error: "목표를 찾을 수 없습니다." });
  });
});

describe("연결 계좌를 보관·복원해도 목표 금액이 튀지 않는다", () => {
  it("보관 확인 창에 연결 목표와 모인 돈이 나오고, 보관·복원 뒤에도 모인 돈이 같다", async () => {
    const r = await createGoal(goalInput({ name: "집", linkedAccountIds: [sav, sav2], startAmount: "10000000" }));
    const id = r.ok ? r.data!.id : "";
    expect(currentOf(await load(id))).toBe(10_000_000);

    const impact = await getArchiveImpact(sav2);
    expect(impact.ok && impact.data!.goals).toContainEqual({ name: "집", current: 10_000_000 });

    expect((await setAccountArchived(sav2, true)).ok).toBe(true);
    balances.delete(sav2); // 보관한 계좌는 잔액 계산에서 빠진다
    const archived = await load(id);
    expect(archived.baseBalance).toBe(30_000_000n);
    expect(currentOf(archived)).toBe(10_000_000);

    expect((await setAccountArchived(sav2, false)).ok).toBe(true);
    balances.set(sav2, 5_000_000);
    const restored = await load(id);
    expect(restored.baseBalance).toBe(35_000_000n);
    expect(currentOf(restored)).toBe(10_000_000);
  });
});

describe("홈 진행률 알림 닫기", () => {
  it("본 단계는 올라가기만 하고, 정해진 단계만 받는다", async () => {
    const r = await createGoal(goalInput());
    const id = r.ok ? r.data!.id : "";
    expect(await dismissGoalMilestone(id, 50)).toEqual({ ok: true });
    expect((await load(id)).milestoneSeen).toBe(50);
    await dismissGoalMilestone(id, 25);
    expect((await load(id)).milestoneSeen).toBe(50);
    expect(await dismissGoalMilestone(id, 30)).toMatchObject({ ok: false });
  });
});
