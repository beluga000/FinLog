import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "@/features/ledger/default-categories";
import type { RecurringTemplate } from "@/features/ledger/queries";
import { toDbDate } from "@/lib/db/prisma";
import type { AccountType, DateStr } from "@/lib/finance/types";
import { ASSET_KINDS, GOAL_TEMPLATES, type OnboardingInput } from "./onboarding-schema";

type Tx = Prisma.TransactionClient;

/** 가구 생성 + 기본 카테고리 복사. 개인 모드도 "구성원 1명 가구"로 만든다 (PROD.MD §1-1). */
export async function createHouseholdWithDefaults(db: Tx, input: { name: string; ownerUserId: string }) {
  const household = await db.household.create({
    data: {
      name: input.name,
      members: { create: { userId: input.ownerUserId, role: "OWNER" } },
    },
  });
  await createDefaultCategories(db, household.id);
  return household;
}

export async function createDefaultCategories(db: Tx, householdId: string) {
  let order = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const parent = await db.category.create({
      data: { householdId, name: cat.name, txType: cat.txType, bucket: cat.bucket, icon: cat.icon, sortOrder: order++ },
    });
    if (cat.children?.length) {
      await db.category.createMany({
        data: cat.children.map((child, i) => ({
          householdId,
          parentId: parent.id,
          name: child.name,
          txType: cat.txType,
          bucket: child.bucket ?? null,
          sortOrder: i,
        })),
      });
    }
  }
}

/**
 * 온보딩 결과로 가구 전체를 만든다 (PROD.MD §1-7): 가구·기본 카테고리·계좌·잔액 스냅샷·정기 규칙·첫 목표.
 * 호출자가 DB 트랜잭션으로 감싼다. 반환값 = householdId.
 */
export async function createOnboardedHousehold(
  db: Tx,
  { userId, input, today, targetDate }: { userId: string; input: OnboardingInput; today: DateStr; targetDate: DateStr },
): Promise<string> {
  const household = await createHouseholdWithDefaults(db, { name: input.householdName, ownerUserId: userId });
  const householdId = household.id;
  if (input.monthStartDay !== 1) await db.household.update({ where: { id: householdId }, data: { monthStartDay: input.monthStartDay } });

  const categories = await db.category.findMany({ where: { householdId }, select: { id: true, name: true } });
  const categoryId = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
  const asOf = toDbDate(today);
  const createAccount = (name: string, type: AccountType, balance: bigint) =>
    db.account.create({
      data: { householdId, name, type, ownerUserId: null, defaultVisibility: "SHARED", snapshots: { create: { asOf, balance } } },
    });

  const linkedAccountIds: string[] = [];
  let checkingId: string | null = null;
  for (const kind of ASSET_KINDS) {
    const entry = input.assets.find((a) => a.kind === kind.key);
    if (!entry) continue;
    const account = await createAccount(kind.accountName, kind.type, BigInt(entry.balance));
    if (entry.linked) linkedAccountIds.push(account.id);
    if (kind.key === "checking") checkingId = account.id;
  }
  // 월급이 들어오고 고정비가 나갈 통장이 없으면 잔액 0으로 만든다
  checkingId ??= (await createAccount("입출금 통장", "CHECKING", 0n)).id;
  if (input.loan && BigInt(input.loan) > 0n) await createAccount("대출", "LOAN", -BigInt(input.loan));

  const rule = (name: string, dayOfMonth: number, template: RecurringTemplate) => ({
    householdId,
    createdByUserId: userId,
    name,
    template: template as object,
    dayOfMonth,
    startDate: asOf,
  });
  const base = { merchant: null, memo: null, visibility: "SHARED" as const };
  await db.recurringRule.createMany({
    data: [
      ...input.incomes.map((i) =>
        rule(i.name, i.day, { ...base, type: "INCOME", amount: i.amount, fromAccountId: null, toAccountId: checkingId, categoryId: categoryId("정기급여") }),
      ),
      ...input.fixed.map((f) =>
        rule(f.name, f.day, { ...base, type: "EXPENSE", amount: f.amount, fromAccountId: checkingId, toAccountId: null, categoryId: categoryId(f.category) }),
      ),
    ],
  });

  await db.assetGoal.create({
    data: {
      householdId,
      name: input.goal.name,
      targetAmount: BigInt(input.goal.targetAmount),
      targetIsReal: true,
      targetDate: toDbDate(targetDate),
      expectedReturn: GOAL_TEMPLATES[input.goal.template].expectedReturn,
      linkedAccountIds,
      priority: 1,
    },
  });
  return householdId;
}
