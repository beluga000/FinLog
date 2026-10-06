import "server-only";
import { prisma, fromDbDate, toDbDate } from "@/lib/db/prisma";
import { dueDates } from "@/lib/finance/recurring";
import { defaultVisibilityFor, validateTxShape } from "@/lib/finance/tx-rules";
import { canSeeAccount } from "@/lib/finance/visibility";
import type { Visibility } from "@/lib/finance/types";
import type { RecurringTemplate } from "./queries";
import { txInputSchema, type TxInput } from "./schema";

type Ctx = { householdId: string; userId: string };

export type ResolvedTx = {
  type: TxInput["type"];
  amount: bigint;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  memo: string | null;
  visibility: Visibility;
  isFixed: boolean;
};

/**
 * 거래 입력 검증: 스키마 → 계좌·카테고리가 내 가구 소속이고 내가 볼 수 있는지 → 유형 규칙.
 * 반환된 데이터만 DB에 쓴다.
 */
export async function resolveTxInput(
  ctx: Ctx,
  raw: unknown,
  opts: { omitDate?: boolean } = {},
): Promise<{ ok: true; data: ResolvedTx & { date?: string } } | { ok: false; error: string }> {
  const schema = opts.omitDate ? txInputSchema.omit({ date: true }) : txInputSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const input = parsed.data as ReturnType<typeof txInputSchema.parse>;

  const accountIds = [input.fromAccountId, input.toAccountId].filter((v): v is string => !!v);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, householdId: ctx.householdId },
    select: { id: true, type: true, ownerUserId: true, defaultVisibility: true, isArchived: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const id of accountIds) {
    const acc = byId.get(id);
    if (!acc || !canSeeAccount(acc, ctx.userId, "us")) return { ok: false, error: "계좌를 찾을 수 없습니다." };
  }
  const from = input.fromAccountId ? byId.get(input.fromAccountId)! : null;
  const to = input.toAccountId ? byId.get(input.toAccountId)! : null;

  if (input.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: input.categoryId, householdId: ctx.householdId },
      select: { txType: true },
    });
    if (!cat) return { ok: false, error: "카테고리를 찾을 수 없습니다." };
    if (cat.txType !== input.type) return { ok: false, error: "거래 유형과 카테고리가 맞지 않습니다." };
  }

  const errors = validateTxShape({
    type: input.type,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromAccountType: from?.type ?? null,
    toAccountType: to?.type ?? null,
    categoryId: input.categoryId,
  });
  if (errors.length) return { ok: false, error: errors[0] };

  return {
    ok: true,
    data: {
      type: input.type,
      date: "date" in input ? (input.date as string) : undefined,
      amount: BigInt(input.amount),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      categoryId: input.categoryId,
      merchant: input.merchant,
      memo: input.memo,
      visibility: input.visibility ?? defaultVisibilityFor(from, to, "SHARED" as Visibility),
      isFixed: input.isFixed,
    },
  };
}

/**
 * 정기 거래 → 실제 거래 생성. 멱등: (recurringRuleId, date) 유니크 + lastRunOn 갱신.
 * 대시보드/가계부 진입 시와 크론에서 호출.
 */
export async function materializeRecurring(householdId: string, today: string): Promise<number> {
  const rules = await prisma.recurringRule.findMany({ where: { householdId, isActive: true } });
  let created = 0;
  for (const rule of rules) {
    const dates = dueDates(
      {
        dayOfMonth: rule.dayOfMonth,
        businessDayAdjust: rule.businessDayAdjust,
        startDate: fromDbDate(rule.startDate),
        endDate: rule.endDate ? fromDbDate(rule.endDate) : null,
      },
      rule.lastRunOn ? fromDbDate(rule.lastRunOn) : null,
      today,
    );
    if (!dates.length) continue;
    const t = rule.template as unknown as RecurringTemplate;
    const result = await prisma.$transaction([
      prisma.transaction.createMany({
        data: dates.map((date) => ({
          householdId,
          createdByUserId: rule.createdByUserId,
          type: t.type,
          date: toDbDate(date),
          amount: BigInt(t.amount),
          fromAccountId: t.fromAccountId,
          toAccountId: t.toAccountId,
          categoryId: t.categoryId,
          merchant: t.merchant,
          memo: t.memo,
          visibility: t.visibility,
          isFixed: true,
          recurringRuleId: rule.id,
        })),
        skipDuplicates: true,
      }),
      prisma.recurringRule.update({ where: { id: rule.id }, data: { lastRunOn: toDbDate(dates[dates.length - 1]) } }),
    ]);
    created += result[0].count;
  }
  return created;
}
