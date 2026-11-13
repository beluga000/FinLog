import "server-only";
import { prisma, fromDbDate, toDbDate } from "@/lib/db/prisma";
import { dueDates } from "@/lib/finance/recurring";
import { defaultVisibilityFor, validateTxShape } from "@/lib/finance/tx-rules";
import { canSeeAccount } from "@/lib/finance/visibility";
import type { AccountType, TxType, Visibility } from "@/lib/finance/types";
import { TRASH_DAYS, type RecurringTemplate } from "./queries";
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
  installmentMonths: number | null;
};

/**
 * 거래 입력 검증: 스키마 → 계좌·카테고리가 내 가구 소속이고 내가 볼 수 있는지 → 유형 규칙.
 * 반환된 데이터만 DB에 쓴다.
 */
const lookupAccountSelect = { id: true, type: true, ownerUserId: true, defaultVisibility: true, isArchived: true } as const;

/** 여러 건을 한 번에 검증할 때 — 계좌·카테고리를 미리 한 번에 읽어 둔다 (건마다 조회하지 않게) */
export async function prefetchTxLookup(ctx: Ctx, accountIds: string[], categoryIds: string[]): Promise<TxLookup> {
  const [accounts, categories] = await Promise.all([
    accountIds.length
      ? prisma.account.findMany({ where: { id: { in: accountIds }, householdId: ctx.householdId }, select: lookupAccountSelect })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.category.findMany({ where: { id: { in: categoryIds }, householdId: ctx.householdId }, select: { id: true, txType: true } })
      : Promise.resolve([]),
  ]);
  return { accounts: new Map(accounts.map((a) => [a.id, a])), categories: new Map(categories.map((c) => [c.id, c])) };
}

export interface TxLookup {
  accounts: Map<string, { id: string; type: AccountType; ownerUserId: string | null; defaultVisibility: Visibility; isArchived: boolean }>;
  categories: Map<string, { txType: TxType }>;
}

export async function resolveTxInput(
  ctx: Ctx,
  raw: unknown,
  opts: { omitDate?: boolean; lookup?: TxLookup } = {},
): Promise<{ ok: true; data: ResolvedTx & { date?: string } } | { ok: false; error: string }> {
  const schema = opts.omitDate ? txInputSchema.omit({ date: true }) : txInputSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const input = parsed.data as ReturnType<typeof txInputSchema.parse>;

  const accountIds = [input.fromAccountId, input.toAccountId].filter((v): v is string => !!v);
  const byId = opts.lookup
    ? opts.lookup.accounts
    : new Map(
        (
          await prisma.account.findMany({
            where: { id: { in: accountIds }, householdId: ctx.householdId },
            select: lookupAccountSelect,
          })
        ).map((a) => [a.id, a]),
      );
  for (const id of accountIds) {
    const acc = byId.get(id);
    if (!acc || !canSeeAccount(acc, ctx.userId, "us")) return { ok: false, error: "계좌를 찾을 수 없습니다." };
  }
  const from = input.fromAccountId ? byId.get(input.fromAccountId)! : null;
  const to = input.toAccountId ? byId.get(input.toAccountId)! : null;

  if (input.categoryId) {
    const cat = opts.lookup
      ? opts.lookup.categories.get(input.categoryId) ?? null
      : await prisma.category.findFirst({
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
  if (input.installmentMonths && (input.type !== "EXPENSE" || from?.type !== "CREDIT_CARD")) {
    return { ok: false, error: "할부는 신용카드 지출에만 넣을 수 있어요." };
  }

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
      installmentMonths: input.installmentMonths ?? null,
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
          needsReview: true,
        })),
        skipDuplicates: true,
      }),
      prisma.recurringRule.update({ where: { id: rule.id }, data: { lastRunOn: toDbDate(dates[dates.length - 1]) } }),
    ]);
    created += result[0].count;
  }
  return created;
}

/**
 * 휴지통 비우기 (매일 크론) — 지운 지 TRASH_DAYS 가 지난 기록을 완전히 지운다. 되돌릴 수 없다.
 * 거래를 가리키는 다른 테이블은 없다 (정산·감사 로그는 id 문자열만 남긴다).
 */
export async function purgeDeletedTransactions(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const { count } = await prisma.transaction.deleteMany({ where: { deletedAt: { lt: before } } });
  return count;
}
