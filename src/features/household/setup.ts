import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "@/features/ledger/default-categories";

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
