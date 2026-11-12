import "server-only";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { getMonthRange } from "@/lib/finance/period";
import { computeSettlement, type SettleResult, type SplitMethodKey } from "@/lib/finance/settlement";
import type { MonthKey } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId" | "members" | "household">;

export interface SplitSetting {
  method: SplitMethodKey;
  /** CUSTOM 일 때 첫 번째 구성원(가입 순) 몫 % */
  percentFirst: number | null;
}

export interface SettlementView {
  month: MonthKey;
  members: { id: string; name: string }[];
  setting: SplitSetting;
  result: SettleResult;
  /** 정산 대상 지출 건수 */
  count: number;
  /** 이 달을 정산 완료로 표시한 기록 */
  done: { from: string; to: string; amount: bigint; settledAt: string | null } | null;
}

export async function getSplitSetting(ctx: Pick<HouseholdContext, "householdId" | "members">): Promise<SplitSetting> {
  const rule = await prisma.splitRule.findFirst({ where: { householdId: ctx.householdId, categoryId: null } });
  if (!rule) return { method: "EQUAL", percentFirst: null };
  const first = ctx.members[0]?.id;
  const ratios = (rule.ratios ?? {}) as Record<string, unknown>;
  const p = first ? ratios[first] : null;
  return { method: rule.method, percentFirst: typeof p === "number" ? p : null };
}

/**
 * 한 달 정산 — 서버에서 계산한다 (배우자의 '합계만 공개' 지출도 금액은 합계에 들어가지만, 화면에는 사람별 합계만 나간다).
 * 비공개 지출·수입은 보지 않는다.
 */
export async function getSettlement(ctx: Ctx, month: MonthKey): Promise<SettlementView | null> {
  if (ctx.members.length < 2) return null;
  const members = ctx.members.slice(0, 2).map((m) => ({ id: m.id, name: m.name }));
  const [a, b] = members.map((m) => m.id) as [string, string];
  const range = getMonthRange(month, ctx.household.monthStartDay);
  const where = {
    householdId: ctx.householdId,
    deletedAt: null,
    visibility: { not: "PRIVATE" as const },
    date: { gte: toDbDate(range.start), lte: toDbDate(range.end) },
  };
  const [setting, expenses, incomes, done] = await Promise.all([
    getSplitSetting(ctx),
    prisma.transaction.findMany({
      where: { ...where, type: "EXPENSE" },
      select: { amount: true, createdByUserId: true, paidByUserId: true, fromAccountId: true, fromAccount: { select: { ownerUserId: true } } },
    }),
    prisma.transaction.findMany({
      where: { ...where, type: "INCOME" },
      select: { amount: true, createdByUserId: true, toAccount: { select: { ownerUserId: true } } },
    }),
    prisma.settlement.findUnique({ where: { householdId_month: { householdId: ctx.householdId, month } } }),
  ]);

  const incomeBy: Record<string, bigint> = { [a]: 0n, [b]: 0n };
  for (const t of incomes) {
    const who = t.toAccount?.ownerUserId ?? t.createdByUserId;
    if (who in incomeBy) incomeBy[who] += t.amount;
  }

  const result = computeSettlement({
    members: [a, b],
    method: setting.method,
    customPercentA: setting.percentFirst,
    incomes: incomeBy,
    expenses: expenses.map((t) => ({
      amount: t.amount,
      // 계좌가 있으면 계좌 명의자(공동 명의 = null), 없으면 낸 사람(기록한 사람)
      payerId: t.fromAccountId ? t.fromAccount?.ownerUserId ?? null : t.paidByUserId ?? t.createdByUserId,
    })),
  });

  return {
    month,
    members,
    setting,
    result,
    count: expenses.length,
    done: done ? { from: done.fromUserId, to: done.toUserId, amount: done.amount, settledAt: done.settledAt?.toISOString() ?? null } : null,
  };
}
