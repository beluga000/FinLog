import "server-only";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { countVisits } from "@/lib/finance/challenge";
import { getMonthKey, getMonthRange } from "@/lib/finance/period";
import type { DateStr, MonthKey } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export interface ChallengeProgress {
  id: string;
  merchant: string;
  limitCount: number;
  count: number;
}

export function getChallenges(ctx: Ctx, month: MonthKey) {
  return prisma.challenge.findMany({ where: { householdId: ctx.householdId, month }, orderBy: { createdAt: "asc" } });
}

/**
 * 이번 달 챌린지와 지금까지 방문 횟수 — 홈 진행 칩.
 * 횟수는 내가 사용처까지 볼 수 있는 지출로만 센다 (배우자 '합계만 공개'·비공개 지출은 사용처를 보이지 않기로 했다).
 */
export async function getChallengeProgress(ctx: Ctx, opts: { today: DateStr; monthStartDay: number }): Promise<ChallengeProgress[]> {
  const month = getMonthKey(opts.today, opts.monthStartDay);
  const challenges = await getChallenges(ctx, month);
  if (!challenges.length) return [];
  const range = getMonthRange(month, opts.monthStartDay);
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      type: "EXPENSE",
      merchant: { not: null },
      date: { gte: toDbDate(range.start), lt: toDbDate(range.end) },
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    select: { merchant: true },
  });
  const merchants = rows.map((r) => r.merchant);
  return challenges.map((c) => ({ id: c.id, merchant: c.merchant, limitCount: c.limitCount, count: countVisits(merchants, c.merchant) }));
}
