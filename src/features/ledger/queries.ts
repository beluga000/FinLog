import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import type { HouseholdContext } from "@/lib/db/context";
import { canSeeAccount, scopeTransactions, txAccess, type SummaryTx, type ViewScope } from "@/lib/finance/visibility";
import type { AccountType, BudgetBucket, DateStr, TxType, Visibility } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  txType: TxType;
  bucket: BudgetBucket | null;
  icon: string | null;
}

export async function getCategories(ctx: Ctx): Promise<CategoryRow[]> {
  return prisma.category.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, txType: true, bucket: true, icon: true },
  });
}

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  ownerUserId: string | null;
  defaultVisibility: Visibility;
  isArchived: boolean;
}

const accountSelect = {
  id: true,
  name: true,
  type: true,
  institution: true,
  ownerUserId: true,
  defaultVisibility: true,
  isArchived: true,
} satisfies Prisma.AccountSelect;

/** 뷰 스코프에서 보이는 계좌 */
export async function getAccounts(ctx: Ctx, scope: ViewScope = "us", opts: { includeArchived?: boolean } = {}) {
  const accounts = await prisma.account.findMany({
    where: { householdId: ctx.householdId, ...(opts.includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: accountSelect,
  });
  return accounts.filter((a) => canSeeAccount(a, ctx.userId, scope));
}

export interface TxRow {
  id: string;
  type: TxType;
  amount: bigint;
  date: DateStr;
  categoryId: string | null;
  categoryName: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  merchant: string | null;
  memo: string | null;
  visibility: Visibility;
  isFixed: boolean;
  createdByUserId: string;
  recurringRuleId: string | null;
}

const txInclude = {
  category: { select: { name: true } },
  fromAccount: { select: { name: true } },
  toAccount: { select: { name: true } },
} satisfies Prisma.TransactionInclude;

type TxWithRel = Prisma.TransactionGetPayload<{ include: typeof txInclude }>;

function toRow(t: TxWithRel): TxRow {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    date: fromDbDate(t.date),
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    fromAccountId: t.fromAccountId,
    fromAccountName: t.fromAccount?.name ?? null,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount?.name ?? null,
    merchant: t.merchant,
    memo: t.memo,
    visibility: t.visibility,
    isFixed: t.isFixed,
    createdByUserId: t.createdByUserId,
    recurringRuleId: t.recurringRuleId,
  };
}

/**
 * 공개범위가 적용된 거래 조회. 반환값의 summarized 는 합계 계산 전용이며 화면 목록에 쓰면 안 된다.
 * PRIVATE 은 DB 단계에서부터 걸러 배우자 데이터가 메모리에도 올라오지 않게 한다.
 */
export async function getScopedTransactions(
  ctx: Ctx,
  range: { start: DateStr; end: DateStr },
  scope: ViewScope,
): Promise<{ items: TxRow[]; summarized: SummaryTx[] }> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      date: { gte: toDbDate(range.start), lt: toDbDate(range.end) },
      OR: [{ createdByUserId: ctx.userId }, { visibility: { not: "PRIVATE" } }],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: txInclude,
  });
  return scopeTransactions(rows.map(toRow), ctx.userId, scope);
}

/** 편집용 단건 조회 — 다른 가구 / 볼 수 없는 거래는 null (AC-9) */
export async function getTransaction(ctx: Ctx, id: string): Promise<TxRow | null> {
  const t = await prisma.transaction.findFirst({
    where: { id, householdId: ctx.householdId, deletedAt: null },
    include: txInclude,
  });
  if (!t || txAccess(t, ctx.userId, "us") !== "full") return null;
  return toRow(t);
}

/** 잔액 계산용 흐름 — 보이는 계좌에 닿는 모든 거래 (계좌 잔액은 계좌의 사실이므로 거래 공개범위와 무관) */
export async function getAccountFlows(ctx: Ctx, accountIds: string[], until: DateStr) {
  if (!accountIds.length) return { snapshots: [], flows: [] };
  const [snapshots, flows] = await Promise.all([
    prisma.accountSnapshot.findMany({
      where: { accountId: { in: accountIds }, asOf: { lte: toDbDate(until) } },
      select: { accountId: true, asOf: true, balance: true },
    }),
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        date: { lte: toDbDate(until) },
        OR: [{ fromAccountId: { in: accountIds } }, { toAccountId: { in: accountIds } }],
      },
      select: { date: true, amount: true, fromAccountId: true, toAccountId: true },
    }),
  ]);
  return {
    snapshots: snapshots.map((s) => ({ ...s, asOf: fromDbDate(s.asOf) })),
    flows: flows.map((f) => ({ ...f, date: fromDbDate(f.date) })),
  };
}

export async function getRecurringRules(ctx: Ctx) {
  const rules = await prisma.recurringRule.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ isActive: "desc" }, { dayOfMonth: "asc" }],
  });
  // 배우자가 만든 규칙은 공개(SHARED) 템플릿만 보여준다
  return rules
    .map((r) => ({
      id: r.id,
      name: r.name,
      template: r.template as unknown as RecurringTemplate,
      dayOfMonth: r.dayOfMonth,
      businessDayAdjust: r.businessDayAdjust,
      startDate: fromDbDate(r.startDate),
      endDate: r.endDate ? fromDbDate(r.endDate) : null,
      lastRunOn: r.lastRunOn ? fromDbDate(r.lastRunOn) : null,
      isActive: r.isActive,
      createdByUserId: r.createdByUserId,
    }))
    .filter((r) => r.createdByUserId === ctx.userId || r.template.visibility === "SHARED");
}

/** RecurringRule.template JSON — 금액은 JSON 호환을 위해 문자열 */
export interface RecurringTemplate {
  type: TxType;
  amount: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  memo: string | null;
  visibility: Visibility;
}
