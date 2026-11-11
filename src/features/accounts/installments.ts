import "server-only";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { MAX_INSTALLMENT_MONTHS, type InstallmentPurchase } from "@/lib/finance/installments";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId">;

/**
 * 카드별 할부 구매 (회차가 아직 남았을 수 있는 것만 — 최대 개월 + 여유 두 달 전까지).
 * 카드값 계산용 합계에만 쓰므로 공개범위와 상관없이 그 카드의 할부를 모두 읽는다 (카드 잔액도 그렇게 계산한다).
 */
export async function getInstallmentPurchases(ctx: Ctx, cardIds: string[], today: DateStr): Promise<Map<string, InstallmentPurchase[]>> {
  const out = new Map<string, InstallmentPurchase[]>();
  if (!cardIds.length) return out;
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      type: "EXPENSE",
      installmentMonths: { gte: 2 },
      fromAccountId: { in: cardIds },
      date: { gte: toDbDate(addDays(today, -(MAX_INSTALLMENT_MONTHS + 2) * 31)) },
    },
    select: { fromAccountId: true, date: true, amount: true, installmentMonths: true },
  });
  for (const r of rows) {
    const list = out.get(r.fromAccountId!) ?? [];
    list.push({ date: fromDbDate(r.date), amount: r.amount, months: r.installmentMonths! });
    out.set(r.fromAccountId!, list);
  }
  return out;
}
