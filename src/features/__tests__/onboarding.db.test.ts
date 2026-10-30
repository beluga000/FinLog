/**
 * DB 통합 테스트 — 온보딩 5단계 결과 생성 (PROD.MD §1-7, AC-10, AC-11)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOnboardedHousehold } from "@/features/household/setup";
import { onboardingSchema, type OnboardingInput } from "@/features/household/onboarding-schema";
import { fromDbDate, prisma } from "@/lib/db/prisma";
import { getMonthRange } from "@/lib/finance/period";
import { calculateSpendable, summarizeSpendableInputs } from "@/lib/finance/spendable";

const TAG = `t${Date.now()}`;
const today = "2026-11-21";
let userId: string;
const created: string[] = [];

const input: OnboardingInput = {
  householdName: "온보딩 테스트",
  goal: { template: "HOME", name: "주택 자금", targetAmount: "200000000", targetMonth: "2030-12" },
  assets: [
    { kind: "checking", balance: "12000000", linked: false },
    { kind: "savings", balance: "48000000", linked: true },
    { kind: "investment", balance: "24000000", linked: true },
  ],
  loan: "30000000",
  incomes: [
    { name: "내 월급", amount: "4300000", day: 25 },
    { name: "배우자 월급", amount: "3900000", day: 25 },
  ],
  fixed: [
    { name: "월세·관리비", category: "관리비", amount: "1200000", day: 5 },
    { name: "통신·구독", category: "휴대폰", amount: "250000", day: 10 },
    { name: "보험", category: "보험", amount: "700000", day: 15 },
  ],
  monthStartDay: 25,
};

async function onboard(data: OnboardingInput) {
  const id = await prisma.$transaction(
    (db) => createOnboardedHousehold(db, { userId, input: onboardingSchema.parse(data), today, targetDate: "2030-12-31" }),
    { timeout: 30_000 },
  );
  created.push(id);
  return id;
}

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `onb-${TAG}@test`, name: "온보딩" } })).id;
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("온보딩 완료 시 생성되는 데이터 (AC-11)", () => {
  it("자산 칸마다 계좌 + 오늘 스냅샷, 대출은 음수 잔액, 줄마다 정기 규칙, priority 1 목표", async () => {
    const hid = await onboard(input);
    const household = await prisma.household.findUniqueOrThrow({ where: { id: hid }, include: { members: true } });
    expect(household.monthStartDay).toBe(25);
    expect(household.members).toMatchObject([{ userId, role: "OWNER" }]);

    const accounts = await prisma.account.findMany({ where: { householdId: hid }, include: { snapshots: true }, orderBy: { createdAt: "asc" } });
    expect(accounts.map((a) => [a.type, a.snapshots.map((s) => [fromDbDate(s.asOf), s.balance])])).toEqual([
      ["CHECKING", [[today, 12_000_000n]]],
      ["SAVINGS", [[today, 48_000_000n]]],
      ["INVESTMENT", [[today, 24_000_000n]]],
      ["LOAN", [[today, -30_000_000n]]],
    ]);

    const rules = await prisma.recurringRule.findMany({ where: { householdId: hid } });
    expect(rules).toHaveLength(5);
    const checking = accounts[0].id;
    for (const r of rules) {
      const t = r.template as { type: string; toAccountId: string | null; fromAccountId: string | null; categoryId: string | null };
      if (t.type === "INCOME") expect(t.toAccountId).toBe(checking);
      else expect(t.fromAccountId).toBe(checking);
      expect(t.categoryId).not.toBeNull();
      expect(fromDbDate(r.startDate)).toBe(today);
    }

    const goals = await prisma.assetGoal.findMany({ where: { householdId: hid } });
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ name: "주택 자금", priority: 1, targetAmount: 200_000_000n, targetIsReal: true, monthlyCommit: null });
    expect(fromDbDate(goals[0].targetDate)).toBe("2030-12-31");
    // 목표에 포함 = 예적금 + 투자 (입출금은 제외)
    expect(goals[0].linkedAccountIds.sort()).toEqual([accounts[1].id, accounts[2].id].sort());
  });

  it("입출금 통장을 입력하지 않아도 월급·고정비가 오갈 통장을 잔액 0으로 만든다", async () => {
    const hid = await onboard({ ...input, assets: [{ kind: "savings", balance: "0", linked: true }], loan: "", monthStartDay: 1 });
    const accounts = await prisma.account.findMany({ where: { householdId: hid }, include: { snapshots: true } });
    expect(accounts.map((a) => [a.type, a.snapshots[0].balance]).sort()).toEqual([
      ["CHECKING", 0n],
      ["SAVINGS", 0n],
    ]);
    expect((await prisma.household.findUniqueOrThrow({ where: { id: hid } })).monthStartDay).toBe(1);
  });

  it("중간에 실패하면 아무것도 남지 않는다 (단일 트랜잭션)", async () => {
    const before = await prisma.household.count();
    await expect(
      prisma.$transaction(async (db) => {
        await createOnboardedHousehold(db, { userId, input: onboardingSchema.parse(input), today, targetDate: "2030-12-31" });
        throw new Error("ABORT");
      }, { timeout: 30_000 }),
    ).rejects.toThrow("ABORT");
    expect(await prisma.household.count()).toBe(before);
  });

  it("스키마: 자산 0칸·월수입 0줄은 거부", () => {
    expect(onboardingSchema.safeParse({ ...input, assets: [] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...input, incomes: [] }).success).toBe(false);
  });
});

describe("온보딩 직후 홈 숫자 (AC-10 데이터 측면)", () => {
  it("정기 규칙만으로 쓸 수 있는 돈이 계산된다", async () => {
    const hid = await onboard(input);
    const rules = await prisma.recurringRule.findMany({ where: { householdId: hid } });
    const range = getMonthRange("2026-12", 25);
    const s = summarizeSpendableInputs({
      rules: rules.map((r) => {
        const t = r.template as { type: "INCOME" | "EXPENSE"; amount: string };
        return { id: r.id, type: t.type, amount: BigInt(t.amount), isActive: r.isActive, startDate: fromDbDate(r.startDate), endDate: null };
      }),
      txs: [],
      goals: [{ status: "ACTIVE", monthly: 1_980_000n }],
      range,
      includeGoals: true,
    });
    expect(s).toEqual({ income: 8_200_000n, fixed: 2_150_000n, goalSaving: 1_980_000n, variableExpense: 0n });
    expect(calculateSpendable({ ...s, daysLeft: 4 }).remaining).toBe(4_070_000n);
  });
});
