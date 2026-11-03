import "server-only";
import { getAccounts, type AccountRow } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import type { Visibility } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId" | "partner">;

export interface SharingAccount extends AccountRow {
  /** 이 계좌를 기본값으로 따르는 내 기록 수 (출금 계좌, 없으면 입금 계좌) */
  myTxCount: number;
  /** 그중 계좌 기본값과 다르게 따로 정한 기록 수 — 일괄 변경에서 제외된다 */
  customTxCount: number;
  /** 배우자가 내 명의로 대신 등록한 계좌 */
  registeredByPartner: boolean;
}

export interface CoupleSharing {
  /** 내가 공개범위를 정하는 계좌: 내 명의 + 공동 */
  editable: SharingAccount[];
  /** 배우자 명의 중 나에게 보이는 계좌 (읽기 전용) */
  partnerAccounts: AccountRow[];
  /** 내가 기록한 거래의 공개범위별 건수 */
  myTxByVisibility: Record<Visibility, number>;
}

/** 부부 설정 화면 — 배우자에게 무엇이 어떻게 보이는지 */
export async function getCoupleSharing(ctx: Ctx): Promise<CoupleSharing> {
  const accounts = await getAccounts(ctx, "us");
  const mineOrJoint = accounts.filter((a) => a.ownerUserId === ctx.userId || a.ownerUserId === null);
  const ids = mineOrJoint.map((a) => a.id);
  const mine = { householdId: ctx.householdId, createdByUserId: ctx.userId, deletedAt: null };

  const [byFrom, byTo, byVisibility, createdForMe] = await Promise.all([
    prisma.transaction.groupBy({ by: ["fromAccountId", "visibility"], where: { ...mine, fromAccountId: { in: ids } }, _count: true }),
    prisma.transaction.groupBy({ by: ["toAccountId", "visibility"], where: { ...mine, fromAccountId: null, toAccountId: { in: ids } }, _count: true }),
    prisma.transaction.groupBy({ by: ["visibility"], where: mine, _count: true }),
    ctx.partner
      ? prisma.auditLog.findMany({
          where: { householdId: ctx.householdId, userId: ctx.partner.id, action: "ACCOUNT_CREATE_FOR_OTHER", entityId: { in: ids } },
          select: { entityId: true },
        })
      : Promise.resolve([]),
  ]);
  const defaultOf = new Map(mineOrJoint.map((a) => [a.id, a.defaultVisibility]));
  const count = new Map<string, { all: number; custom: number }>();
  const add = (id: string | null, visibility: Visibility, n: number) => {
    if (!id) return;
    const c = count.get(id) ?? { all: 0, custom: 0 };
    c.all += n;
    if (visibility !== defaultOf.get(id)) c.custom += n;
    count.set(id, c);
  };
  for (const g of byFrom) add(g.fromAccountId, g.visibility, g._count);
  for (const g of byTo) add(g.toAccountId, g.visibility, g._count);
  const byPartner = new Set(createdForMe.map((l) => l.entityId));

  const myTxByVisibility: Record<Visibility, number> = { SHARED: 0, SUMMARY_ONLY: 0, PRIVATE: 0 };
  for (const g of byVisibility) myTxByVisibility[g.visibility] = g._count;

  return {
    editable: mineOrJoint.map((a) => ({ ...a, myTxCount: count.get(a.id)?.all ?? 0,
      customTxCount: count.get(a.id)?.custom ?? 0, registeredByPartner: byPartner.has(a.id) })),
    partnerAccounts: accounts.filter((a) => a.ownerUserId !== null && a.ownerUserId !== ctx.userId),
    myTxByVisibility,
  };
}
