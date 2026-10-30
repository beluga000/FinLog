/**
 * DB 통합 테스트 — 홈 (PROD.MD §2-8, §2-10, AC-13, AC-14, AC-19)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeSpendable, getReviewItems, getSpendableSource } from "@/features/dashboard/home";
import { getGoalsOverview } from "@/features/goals/queries";
import { onboardingSchema, type OnboardingInput } from "@/features/household/onboarding-schema";
import { createOnboardedHousehold } from "@/features/household/setup";
import { getMonthlyClosing } from "@/features/reports/closing";
import { materializeRecurring } from "@/features/ledger/service";
import { prisma, toDbDate } from "@/lib/db/prisma";

const TAG = `t${Date.now()}`;
const onboardedOn = "2026-11-21";
const today = "2026-12-16";
let userId: string;
let hid: string;
let ctx: { householdId: string; userId: string };

const input: OnboardingInput = {
  householdName: "홈 테스트",
  goal: { template: "HOME", name: "주택 자금", targetAmount: "200000000", targetMonth: "2030-12" },
  assets: [
    { kind: "checking", balance: "12000000", linked: false },
    { kind: "investment", balance: "24000000", linked: true },
  ],
  loan: "",
  incomes: [{ name: "월급", amount: "8200000", day: 25 }],
  fixed: [
    { name: "월세·관리비", category: "관리비", amount: "1200000", day: 5 },
    { name: "통신·구독", category: "휴대폰", amount: "250000", day: 10 },
    { name: "보험", category: "보험", amount: "700000", day: 15 },
  ],
  monthStartDay: 1,
};

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `home-${TAG}@test`, name: "홈" } })).id;
  hid = await prisma.$transaction(
    (db) =>
      createOnboardedHousehold(db, { userId, input: onboardingSchema.parse(input), today: onboardedOn, targetDate: "2030-12-31" }),
    { timeout: 30_000 },
  );
  ctx = { householdId: hid, userId };
  // 11/25 월급, 12/5·10·15 고정비가 생성된다
  await materializeRecurring(hid, today);
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: hid } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}@test` } } });
  await prisma.$disconnect();
});

describe("쓸 수 있는 돈 (AC-13, AC-14)", () => {
  it("정기 규칙이 만든 고정 지출은 다시 차감하지 않는다", async () => {
    const realized = await prisma.transaction.count({ where: { householdId: hid, type: "EXPENSE", recurringRuleId: { not: null } } });
    expect(realized).toBe(3);
    const s = computeSpendable(await getSpendableSource(ctx, "us", { today, monthStartDay: 1, goals: [] }));
    expect(s).toMatchObject({ income: 8_200_000n, fixed: 2_150_000n, variableExpense: 0n, remaining: 6_050_000n });
  });

  it("변동 지출 저장 전후 값을 같은 조회로 계산한다", async () => {
    const checking = await prisma.account.findFirstOrThrow({ where: { householdId: hid, type: "CHECKING" } });
    const tx = await prisma.transaction.create({
      data: {
        householdId: hid,
        createdByUserId: userId,
        type: "EXPENSE",
        date: toDbDate(today),
        amount: 54_000n,
        fromAccountId: checking.id,
        visibility: "SHARED",
      },
    });
    const source = await getSpendableSource(ctx, "us", { today, monthStartDay: 1, goals: [] });
    expect(computeSpendable(source, { excludeTxId: tx.id }).remaining).toBe(6_050_000n);
    const after = computeSpendable(source);
    expect(after.remaining).toBe(5_996_000n);
    // 12/16 포함 남은 16일
    expect(after.daily).toBe(5_996_000n / 16n);
    await prisma.transaction.delete({ where: { id: tx.id } });
  });
});

describe("목표 계획 저장 → 홈 목표 저축 (AC-15)", () => {
  it("monthlyCommit 을 저장하면 쓸 수 있는 돈의 목표 저축이 그 값이 된다", async () => {
    const goal = await prisma.assetGoal.findFirstOrThrow({ where: { householdId: hid } });
    await prisma.assetGoal.update({ where: { id: goal.id }, data: { monthlyCommit: 1_000_000n } });
    const { goals } = await getGoalsOverview(ctx, { today, monthStartDay: 1 });
    const s = computeSpendable(await getSpendableSource(ctx, "us", { today, monthStartDay: 1, goals }));
    expect(s.goalSaving).toBe(1_000_000n);
    expect(s.remaining).toBe(5_050_000n);
    // 나 뷰는 목표 저축을 빼지 않는다
    expect(computeSpendable(await getSpendableSource(ctx, "me", { today, monthStartDay: 1, goals })).goalSaving).toBe(0n);
  });
});

describe("확인할 일 (AC-19)", () => {
  it("정기 규칙이 만든 거래가 오래된 순 최대 3건 나오고, 확인하면 사라진다", async () => {
    const items = await getReviewItems(ctx, { today });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind === "recurring" && [i.date, i.tx.amount])).toEqual([
      ["2026-11-25", 8_200_000n],
      ["2026-12-05", 1_200_000n],
      ["2026-12-10", 250_000n],
    ]);

    const first = items[0].kind === "recurring" ? items[0].tx.id : "";
    await prisma.transaction.update({ where: { id: first }, data: { needsReview: false } });
    const next = await getReviewItems(ctx, { today });
    expect(next.map((i) => i.key)).not.toContain(`tx:${first}`);
    expect(next.map((i) => i.date)).toEqual(["2026-12-05", "2026-12-10", "2026-12-15"]);
  });

  it("평가액 계좌는 마지막 잔액 입력이 30일 넘으면 잔액 업데이트로 나온다", async () => {
    expect((await getReviewItems(ctx, { today })).some((i) => i.kind === "balance")).toBe(false);
    const later = await getReviewItems(ctx, { today: "2027-01-10" });
    expect(later[0]).toMatchObject({ kind: "balance", date: onboardedOn, account: { type: "INVESTMENT", balance: 24_000_000n } });
  });
});

describe("월간 결산 (AC-16)", () => {
  it("지난달 기록이 없으면 결산을 띄우지 않는다", async () => {
    const { goals } = await getGoalsOverview(ctx, { today: onboardedOn, monthStartDay: 1 });
    expect(await getMonthlyClosing(ctx, { today: onboardedOn, monthStartDay: 1, goals })).toBeNull();
  });

  it("월 시작일이 지나면 지난달 결산과 조정 제안(최대 3개)을 계산한다", async () => {
    const checking = await prisma.account.findFirstOrThrow({ where: { householdId: hid, type: "CHECKING" } });
    const dining = await prisma.category.findFirstOrThrow({ where: { householdId: hid, name: "외식" } });
    // 11월에 생활비를 크게 넘긴 외식 지출
    const tx = await prisma.transaction.create({
      data: {
        householdId: hid,
        createdByUserId: userId,
        type: "EXPENSE",
        date: toDbDate("2026-11-28"),
        amount: 9_000_000n,
        fromAccountId: checking.id,
        categoryId: dining.id,
        visibility: "SHARED",
      },
    });
    const { goals } = await getGoalsOverview(ctx, { today, monthStartDay: 1 });
    const closing = await getMonthlyClosing(ctx, { today, monthStartDay: 1, goals });
    expect(closing).not.toBeNull();
    expect(closing!.month).toBe("2026-11");
    expect(closing!.spendableResult < 0n).toBe(true);
    expect(closing!.suggestions.length).toBeLessThanOrEqual(3);
    expect(closing!.suggestions[0]).toMatchObject({ kind: "category", href: "/ledger?month=2026-11" });
    expect(closing!.primaryGoal?.name).toBe("주택 자금");
    await prisma.transaction.delete({ where: { id: tx.id } });
  });
});
