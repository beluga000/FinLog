"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/ledger/schema";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { challengeLimit } from "@/lib/finance/challenge";
import { canHaveRule, merchantKey } from "@/lib/finance/merchant-rules";
import { getMonthKey, todayKST } from "@/lib/finance/period";

/**
 * 결산 제안 "같은 사용처 N번" → 이번 달 절반까지 해 보기 (가구 공유, 같은 달·같은 사용처는 하나).
 * 기준 횟수·금액은 결산 카드가 계산한 지난달 값이다.
 */
export async function startChallenge(input: { merchant: string; baselineCount: number; baselineAmount: string }): Promise<ActionResult<{ limitCount: number }>> {
  const ctx = await requireHousehold();
  const merchant = typeof input?.merchant === "string" ? input.merchant.trim().slice(0, 100) : "";
  const baselineCount = Number(input?.baselineCount);
  if (!canHaveRule(merchant)) return { ok: false, error: "사용처를 확인하세요." };
  if (!Number.isInteger(baselineCount) || baselineCount < 2 || baselineCount > 200) return { ok: false, error: "횟수를 확인하세요." };
  if (typeof input.baselineAmount !== "string" || !/^\d{1,13}$/.test(input.baselineAmount)) return { ok: false, error: "금액을 확인하세요." };
  const household = await prisma.household.findUniqueOrThrow({ where: { id: ctx.householdId }, select: { monthStartDay: true } });
  const month = getMonthKey(todayKST(), household.monthStartDay);
  const key = merchantKey(merchant);
  const limitCount = challengeLimit(baselineCount);
  await prisma.challenge.upsert({
    where: { householdId_month_merchantKey: { householdId: ctx.householdId, month, merchantKey: key } },
    create: { householdId: ctx.householdId, month, merchantKey: key, merchant, limitCount, baselineCount, baselineAmount: BigInt(input.baselineAmount), createdByUserId: ctx.userId },
    update: {},
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { limitCount } };
}

export async function cancelChallenge(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const r = await prisma.challenge.deleteMany({ where: { id: String(id), householdId: ctx.householdId } });
  if (!r.count) return { ok: false, error: "챌린지를 찾을 수 없어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}
