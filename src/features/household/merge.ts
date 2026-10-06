import type { Prisma } from "@/generated/prisma/client";

/**
 * 개인 가구 → 부부 가구 합류 시 데이터 이관 (PROD.MD §1-2).
 * - keep    : 공개범위 유지하여 가져오기
 * - private : 모든 계좌·거래·정기거래를 PRIVATE 으로 가져오기
 * 카테고리는 (유형, 대분류명, 소분류명)으로 대상 가구 카테고리에 매핑하고, 없으면 새로 만든다.
 * 이관 대상 가구에는 이 사용자 혼자였으므로 모든 데이터의 작성자는 이 사용자다.
 */
export type JoinDataMode = "keep" | "private";

type Tx = Prisma.TransactionClient;

export async function moveHouseholdData(
  db: Tx,
  p: { fromHouseholdId: string; toHouseholdId: string; userId: string; mode: JoinDataMode },
) {
  const categoryMap = await mapCategories(db, p.fromHouseholdId, p.toHouseholdId);
  const priv = p.mode === "private";

  // 계좌: 혼자 쓰던 공동명의(null)는 이제 본인 명의로
  const accounts = await db.account.findMany({ where: { householdId: p.fromHouseholdId } });
  for (const a of accounts) {
    await db.account.update({
      where: { id: a.id },
      data: {
        householdId: p.toHouseholdId,
        ownerUserId: a.ownerUserId ?? p.userId,
        ...(priv ? { defaultVisibility: "PRIVATE" } : {}),
      },
    });
  }

  const txs = await db.transaction.findMany({ where: { householdId: p.fromHouseholdId }, select: { id: true, categoryId: true } });
  for (const t of txs) {
    await db.transaction.update({
      where: { id: t.id },
      data: {
        householdId: p.toHouseholdId,
        categoryId: t.categoryId ? categoryMap.get(t.categoryId) ?? null : null,
        importHash: null,
        ...(priv ? { visibility: "PRIVATE" } : {}),
      },
    });
  }

  const rules = await db.recurringRule.findMany({ where: { householdId: p.fromHouseholdId } });
  for (const r of rules) {
    const template = r.template as Record<string, unknown>;
    const categoryId = typeof template.categoryId === "string" ? categoryMap.get(template.categoryId) ?? null : null;
    await db.recurringRule.update({
      where: { id: r.id },
      data: {
        householdId: p.toHouseholdId,
        template: { ...template, categoryId, ...(priv ? { visibility: "PRIVATE" } : {}) },
      },
    });
  }

  // 목표는 가구 공동 목표이므로 그대로 이관 (우선순위는 기존 목표 뒤로)
  const maxPriority = await db.assetGoal.aggregate({ where: { householdId: p.toHouseholdId }, _max: { priority: true } });
  const goals = await db.assetGoal.findMany({ where: { householdId: p.fromHouseholdId }, orderBy: { priority: "asc" } });
  let priority = (maxPriority._max.priority ?? 0) + 1;
  for (const g of goals) {
    await db.assetGoal.update({ where: { id: g.id }, data: { householdId: p.toHouseholdId, priority: priority++, planId: null } });
  }
}

async function mapCategories(db: Tx, fromId: string, toId: string): Promise<Map<string, string>> {
  const [from, to] = await Promise.all([
    db.category.findMany({ where: { householdId: fromId } }),
    db.category.findMany({ where: { householdId: toId } }),
  ]);
  const key = (txType: string, parentName: string | null, name: string) => `${txType}|${parentName ?? ""}|${name}`;
  const nameOf = (list: typeof from, id: string | null) => (id ? list.find((c) => c.id === id)?.name ?? null : null);

  const targetByKey = new Map(to.map((c) => [key(c.txType, nameOf(to, c.parentId), c.name), c.id]));
  const map = new Map<string, string>();

  // 대분류 먼저
  for (const c of from.filter((c) => !c.parentId)) {
    const k = key(c.txType, null, c.name);
    let target = targetByKey.get(k);
    if (!target) {
      const created = await db.category.create({
        data: { householdId: toId, name: c.name, txType: c.txType, bucket: c.bucket, icon: c.icon, sortOrder: c.sortOrder },
      });
      target = created.id;
      targetByKey.set(k, target);
    }
    map.set(c.id, target);
  }
  for (const c of from.filter((c) => c.parentId)) {
    const parentName = nameOf(from, c.parentId);
    const k = key(c.txType, parentName, c.name);
    let target = targetByKey.get(k);
    if (!target) {
      const created = await db.category.create({
        data: { householdId: toId, parentId: map.get(c.parentId!)!, name: c.name, txType: c.txType, bucket: c.bucket, sortOrder: c.sortOrder },
      });
      target = created.id;
      targetByKey.set(k, target);
    }
    map.set(c.id, target);
  }
  return map;
}
