import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type DeleteOutcome =
  /** 가구에 속하지 않은 계정 — 계정만 삭제 */
  | { kind: "user" }
  /** 혼자 쓰던 가구 — 가구째 삭제 (계좌·거래·정기 거래·목표 모두) */
  | { kind: "household"; householdId: string }
  /** 부부 가구 — 이 사람만 빠지고 가구는 배우자에게 남는다 */
  | { kind: "member"; householdId: string; partnerId: string };

/**
 * 계정 삭제 (서비스 관리자 · 본인 탈퇴 공용). 호출자가 DB 트랜잭션으로 감싼다.
 * 부부 가구면 detachMember 로 이 사람만 빼고(가구는 배우자에게 남는다) 계정을 지운다.
 */
export async function deleteUserAccount(db: Tx, userId: string): Promise<DeleteOutcome> {
  const membership = await db.householdMember.findFirst({
    where: { userId, leftAt: null },
    include: { household: { include: { members: { where: { leftAt: null } } } } },
  });

  if (!membership) {
    await db.user.delete({ where: { id: userId } });
    return { kind: "user" };
  }

  const householdId = membership.householdId;
  const partner = membership.household.members.find((m) => m.userId !== userId) ?? null;
  if (!partner) {
    await db.household.delete({ where: { id: householdId } });
    await db.user.delete({ where: { id: userId } });
    return { kind: "household", householdId };
  }

  await detachMember(db, { userId, householdId, partnerUserId: partner.userId, partnerMemberId: partner.id, wasOwner: membership.role === "OWNER" });
  await db.user.delete({ where: { id: userId } }); // 가구 연결(HouseholdMember)도 함께 삭제
  return { kind: "member", householdId, partnerId: partner.userId };
}

/** 부부 가구에서 빠질 때 지워지는 것 — 화면에서 미리 보여 준다 */
export async function detachImpact(db: Tx, userId: string, householdId: string) {
  const privateAccounts = await db.account.findMany({
    where: { householdId, ownerUserId: userId, defaultVisibility: "PRIVATE" },
    select: { id: true },
  });
  const privateIds = privateAccounts.map((a) => a.id);
  const privateTx = await db.transaction.count({
    where: {
      householdId,
      deletedAt: null,
      OR: [{ createdByUserId: userId, visibility: "PRIVATE" }, { fromAccountId: { in: privateIds } }, { toAccountId: { in: privateIds } }],
    },
  });
  const ownAccounts = await db.account.count({ where: { householdId, ownerUserId: userId, defaultVisibility: { not: "PRIVATE" } } });
  return { privateAccounts: privateIds.length, privateTx, ownAccounts };
}

/**
 * 부부 가구에서 한 사람을 뺀다 (남는 배우자 기준으로 정리). 탈퇴·관리자 삭제·가구 나가기가 같이 쓴다.
 * - 비공개 계좌·거래·정기 거래: 삭제 — 원래 배우자에게 보이지 않던 데이터라 남겨도 아무도 볼 수 없다
 * - 공개 계좌: 공동 명의로 — 주인 없는 계좌가 남지 않게 (공동은 비공개가 될 수 없으므로 공개 계좌만)
 * - 정기 거래(공개): 배우자에게 넘김 — 등록한 사람만 수정·중지할 수 있어 그대로 두면 멈출 수 없다
 * - 기록한 공개 거래: 그대로 — 가구의 지난 기록으로 남는다
 * - 가구 관리자였다면 배우자가 관리자를 이어받는다
 * 가구 연결(HouseholdMember)은 건드리지 않는다 — 호출자가 지우거나 leftAt 을 찍는다.
 */
export async function detachMember(
  db: Tx,
  p: { userId: string; householdId: string; partnerUserId: string; partnerMemberId: string; wasOwner: boolean },
) {
  const { userId, householdId } = p;
  // 비공개 계좌: 그 계좌가 걸린 거래부터 지운다 (거래 → 계좌 FK 는 삭제 제한)
  const privateAccounts = await db.account.findMany({
    where: { householdId, ownerUserId: userId, defaultVisibility: "PRIVATE" },
    select: { id: true },
  });
  const privateIds = privateAccounts.map((a) => a.id);
  await db.transaction.deleteMany({
    where: {
      householdId,
      OR: [
        { createdByUserId: userId, visibility: "PRIVATE" },
        { fromAccountId: { in: privateIds } },
        { toAccountId: { in: privateIds } },
      ],
    },
  });
  if (privateIds.length) {
    await db.account.deleteMany({ where: { id: { in: privateIds } } });
    const goals = await db.assetGoal.findMany({ where: { householdId, linkedAccountIds: { hasSome: privateIds } } });
    for (const g of goals) {
      await db.assetGoal.update({ where: { id: g.id }, data: { linkedAccountIds: g.linkedAccountIds.filter((id) => !privateIds.includes(id)) } });
    }
  }
  await db.account.updateMany({ where: { householdId, ownerUserId: userId }, data: { ownerUserId: null } });

  const rules = await db.recurringRule.findMany({ where: { householdId, createdByUserId: userId } });
  for (const r of rules) {
    const t = r.template as { visibility?: string; fromAccountId?: string | null; toAccountId?: string | null };
    const touchesPrivate = (t.fromAccountId && privateIds.includes(t.fromAccountId)) || (t.toAccountId && privateIds.includes(t.toAccountId));
    if (t.visibility === "PRIVATE" || touchesPrivate) await db.recurringRule.delete({ where: { id: r.id } });
    else await db.recurringRule.update({ where: { id: r.id }, data: { createdByUserId: p.partnerUserId } });
  }

  if (p.wasOwner) await db.householdMember.update({ where: { id: p.partnerMemberId }, data: { role: "OWNER" } });
  // 가입 대기 초대 코드는 무효화 (만든 사람이 사라짐)
  await db.householdInvite.updateMany({ where: { householdId, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
  // 정산 방식(사람별 비율)은 한 사람이 빠지면 의미가 없다 — 지난 정산 기록은 남긴다
  await db.splitRule.deleteMany({ where: { householdId } });
}
