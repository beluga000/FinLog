import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import type { HouseholdContext } from "@/lib/db/context";
import { canSeeAccount, scopeTransactions, txAccess, type SummaryTx, type ViewScope } from "@/lib/finance/visibility";
import { isGenericMerchant } from "@/lib/finance/merchant-match";
import { memoKey, type MemoHint, type MerchantRule } from "@/lib/finance/merchant-rules";
import { addDays } from "@/lib/finance/period";
import { findRecurringCandidates, recurringCandidateKey, type RecurringCandidate } from "@/lib/finance/recurring-detect";
import type { TxQuery } from "@/lib/finance/tx-search";
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

/*
 * 요청 단위 캐시 (React cache) — 한 화면을 그리는 동안 레이아웃·페이지·하위 조회가 같은 데이터를 여러 번 읽지 않게 한다.
 * 키는 원시값만 쓴다. 결과는 읽기 전용으로 다룬다(정렬·push 금지).
 * 서버 액션에서 "쓰기 전에 읽고 쓰기 뒤에 다시 읽는" 곳은 { fresh: true } 로 캐시를 건너뛴다.
 */

const loadCategories = cache(
  (householdId: string): Promise<CategoryRow[]> =>
    prisma.category.findMany({
      where: { householdId },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true, txType: true, bucket: true, icon: true },
    }),
);

export function getCategories(ctx: Ctx): Promise<CategoryRow[]> {
  return loadCategories(ctx.householdId);
}

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  ownerUserId: string | null;
  defaultVisibility: Visibility;
  isArchived: boolean;
  /** 카드 결제일 · 대출 납입일 (CREDIT_CARD · LOAN) */
  billingDay: number | null;
  /** 카드 대금 · 대출 이자·상환금 출금 계좌 (CREDIT_CARD · LOAN) */
  paymentAccountId: string | null;
  /** 예적금 가입일 / 대출일 · 만기일 · 연 금리 (SAVINGS · LOAN) */
  openedOn: DateStr | null;
  maturityDate: DateStr | null;
  interestRate: number | null;
  /** 정책형 적금 종류·기여금 구간 (SAVINGS) */
  savingsProduct: string | null;
  savingsTier: string | null;
  /** 대출 상환 방식 (LOAN) */
  loanRepayment: string | null;
  /** 전세·월세 보증금 대출 — 순자산에서 뺀다 (LOAN) */
  depositLoan: boolean;
  /** 세제 혜택 계좌 (PENSION_SAVINGS · IRP · ISA) */
  taxWrapper: string | null;
  /** 잔액을 1년에 한 번만 확인 */
  balanceCheckYearly: boolean;
}

const accountSelect = {
  id: true,
  name: true,
  type: true,
  institution: true,
  ownerUserId: true,
  defaultVisibility: true,
  isArchived: true,
  billingDay: true,
  paymentAccountId: true,
  openedOn: true,
  maturityDate: true,
  interestRate: true,
  savingsProduct: true,
  savingsTier: true,
  loanRepayment: true,
  depositLoan: true,
  taxWrapper: true,
  balanceCheckYearly: true,
} satisfies Prisma.AccountSelect;

/** 가구의 모든 계좌 (보관 포함) — 보관 여부·스코프는 메모리에서 거른다 */
const queryHouseholdAccounts = (householdId: string) =>
  prisma.account.findMany({
    where: { householdId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: accountSelect,
  });
const loadHouseholdAccounts = cache(queryHouseholdAccounts);

/** 뷰 스코프에서 보이는 계좌 */
export async function getAccounts(
  ctx: Ctx,
  scope: ViewScope = "us",
  opts: { includeArchived?: boolean; fresh?: boolean } = {},
): Promise<AccountRow[]> {
  const accounts = await (opts.fresh ? queryHouseholdAccounts : loadHouseholdAccounts)(ctx.householdId);
  // Date·Decimal 은 클라이언트 컴포넌트로 넘길 수 있게 문자열·숫자로 바꾼다
  return accounts
    .filter((a) => (opts.includeArchived || !a.isArchived) && canSeeAccount(a, ctx.userId, scope))
    .map(
      (a): AccountRow => ({
        ...a,
        openedOn: a.openedOn ? fromDbDate(a.openedOn) : null,
        maturityDate: a.maturityDate ? fromDbDate(a.maturityDate) : null,
        interestRate: a.interestRate === null ? null : Number(a.interestRate),
      }),
    );
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
  notDuplicate: boolean;
  /** 신용카드 할부 개월 (일시불이면 null) */
  installmentMonths: number | null;
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
    notDuplicate: t.notDuplicate,
    installmentMonths: t.installmentMonths,
  };
}

/** 휴지통에 머무는 기간 — 이보다 오래 지난 지운 기록은 크론이 완전히 지운다 (purgeDeletedTransactions) */
export const TRASH_DAYS = 30;

export interface DeletedTxRow extends TxRow {
  /** 지운 시각 (ISO) */
  deletedAt: string;
}

/**
 * 최근 지운 기록 (휴지통) — 복원할 수 있는 것만: 내가 쓴 기록과 배우자의 공유 기록.
 * 배우자의 합계만·비공개 기록은 원래 건별로 보이지 않으므로 여기에도 나오지 않는다.
 */
export async function getDeletedTransactions(ctx: Ctx, now: Date = new Date()): Promise<DeletedTxRow[]> {
  const since = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: { gte: since },
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    orderBy: { deletedAt: "desc" },
    take: 200,
    include: txInclude,
  });
  return rows
    .filter((t) => txAccess(t, ctx.userId, "us") === "full")
    .map((t) => ({ ...toRow(t), deletedAt: t.deletedAt!.toISOString() }));
}

/**
 * 공개범위가 적용된 거래 조회. 반환값의 summarized 는 합계 계산 전용이며 화면 목록에 쓰면 안 된다.
 * PRIVATE 은 DB 단계에서부터 걸러 배우자 데이터가 메모리에도 올라오지 않게 한다.
 */
export function getScopedTransactions(
  ctx: Ctx,
  range: { start: DateStr; end: DateStr },
  scope: ViewScope,
): Promise<{ items: TxRow[]; summarized: SummaryTx[] }> {
  // 같은 기간을 홈(이번 달 저축·합계)·결산에서 여러 번 읽으므로 요청 단위로 한 번만
  return loadScopedTransactions(ctx.householdId, ctx.userId, range.start, range.end, scope);
}

const loadScopedTransactions = cache(
  async (householdId: string, userId: string, start: DateStr, end: DateStr, scope: ViewScope) => {
    const rows = await prisma.transaction.findMany({
      where: {
        householdId,
        deletedAt: null,
        date: { gte: toDbDate(start), lt: toDbDate(end) },
        OR: [{ createdByUserId: userId }, { visibility: { not: "PRIVATE" } }],
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: txInclude,
    });
    return scopeTransactions(rows.map(toRow), userId, scope);
  },
);

/**
 * 최근 기록 n건 — 기간 전체가 아니라 필요한 만큼만 읽는다.
 * 배우자의 '합계만 공개' 거래는 목록에서 빠지므로 여유 있게 읽고 거른다.
 */
export async function getLatestTransactions(
  ctx: Ctx,
  scope: ViewScope,
  opts: { since: DateStr; until: DateStr; limit: number },
): Promise<TxRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      date: { gte: toDbDate(opts.since), lt: toDbDate(opts.until) },
      OR: [{ createdByUserId: ctx.userId }, { visibility: { not: "PRIVATE" } }],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts.limit * 4,
    include: txInclude,
  });
  return scopeTransactions(rows.map(toRow), ctx.userId, scope).items.slice(0, opts.limit);
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

/** 정기거래 확인용 — 내가 편집할 수 있는(full) 미확인 거래, 오래된 순 */
export async function getReviewTransactions(ctx: Ctx, limit: number): Promise<TxRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      needsReview: true,
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: txInclude,
  });
  return rows.filter((t) => txAccess(t, ctx.userId, "us") === "full").map(toRow);
}

/** 가구 전체 잔액 재료 — 모든 계좌의 스냅샷과 계좌에 닿는 거래 흐름 (날짜순) */
async function queryHouseholdFlows(householdId: string, until: DateStr) {
  const [snapshots, flows] = await Promise.all([
    prisma.accountSnapshot.findMany({
      where: { account: { householdId }, asOf: { lte: toDbDate(until) } },
      select: { accountId: true, asOf: true, balance: true },
      orderBy: { asOf: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        householdId,
        deletedAt: null,
        date: { lte: toDbDate(until) },
        OR: [{ fromAccountId: { not: null } }, { toAccountId: { not: null } }],
      },
      select: { date: true, amount: true, fromAccountId: true, toAccountId: true },
      orderBy: { date: "asc" },
    }),
  ]);
  return {
    snapshots: snapshots.map((s) => ({ ...s, asOf: fromDbDate(s.asOf) })),
    flows: flows.map((f) => ({ ...f, date: fromDbDate(f.date) })),
  };
}
const loadHouseholdFlows = cache(queryHouseholdFlows);

/**
 * 잔액 계산용 흐름 — 보이는 계좌에 닿는 모든 거래 (계좌 잔액은 계좌의 사실이므로 거래 공개범위와 무관).
 * 한 요청에서 홈·목표·결산이 각자 부르므로 가구 전체를 한 번 읽어 두고 계좌별로 거른다. 결과는 날짜순.
 */
export async function getAccountFlows(ctx: Ctx, accountIds: string[], until: DateStr, opts: { fresh?: boolean } = {}) {
  if (!accountIds.length) return { snapshots: [], flows: [] };
  const all = await (opts.fresh ? queryHouseholdFlows : loadHouseholdFlows)(ctx.householdId, until);
  const ids = new Set(accountIds);
  return {
    snapshots: all.snapshots.filter((s) => ids.has(s.accountId)),
    flows: all.flows.filter(
      (f) => (f.fromAccountId !== null && ids.has(f.fromAccountId)) || (f.toAccountId !== null && ids.has(f.toAccountId)),
    ),
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

export interface MerchantSuggestion {
  merchant: string;
  /** 이 사용처에 마지막으로 쓴 카테고리·계좌 — 고르면 입력 창에 채운다 */
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
}

const MERCHANT_SCAN = 400;
const MERCHANT_MAX = 40;

/**
 * 사용처 자동완성 후보 — 최근 거래 400건에서 사용처를 자주 쓴 순(같으면 최근 순)으로 40개.
 * 배우자 거래는 '공유'만 본다. '합계만 공개'는 건별 내용을 보여 주지 않기로 했으므로 사용처도 제외한다.
 */
export async function queryMerchantSuggestions(ctx: Ctx, type: TxType): Promise<MerchantSuggestion[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      type,
      merchant: { not: null },
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: MERCHANT_SCAN,
    select: { merchant: true, categoryId: true, fromAccountId: true, toAccountId: true },
  });
  // 최신순으로 훑으며 사용처별 첫 행(= 가장 최근 값)과 횟수를 모은다
  const byMerchant = new Map<string, { s: MerchantSuggestion; count: number; order: number }>();
  rows.forEach((r, i) => {
    const name = r.merchant!.trim();
    if (!name) return;
    const hit = byMerchant.get(name);
    if (hit) hit.count += 1;
    else
      byMerchant.set(name, {
        s: { merchant: name, categoryId: r.categoryId, fromAccountId: r.fromAccountId, toAccountId: r.toAccountId },
        count: 1,
        order: i,
      });
  });
  return [...byMerchant.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, MERCHANT_MAX)
    .map((v) => v.s);
}

const MEMO_SCAN = 400;
const MEMO_MAX = 100;

/**
 * 네이버페이·쿠팡 같은 곳에 쓴 메모 → 카테고리 (최근 것 우선, 메모마다 하나).
 * 자동완성과 같은 범위 — 내 기록과 배우자의 '공유' 기록만.
 */
export async function queryMemoHints(ctx: Ctx): Promise<MemoHint[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      type: "EXPENSE",
      memo: { not: null },
      merchant: { not: null },
      categoryId: { not: null },
      OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: MEMO_SCAN,
    select: { merchant: true, memo: true, categoryId: true },
  });
  const byKey = new Map<string, MemoHint>();
  for (const r of rows) {
    if (!isGenericMerchant(r.merchant)) continue;
    const k = memoKey(r.memo);
    if (k.length >= 2 && !byKey.has(k)) byKey.set(k, { memoKey: k, categoryId: r.categoryId! });
    if (byKey.size >= MEMO_MAX) break;
  }
  return [...byKey.values()];
}

/** 가구 가맹점 규칙 (가구 공유) — 긴 키부터 (지점 규칙이 브랜드 규칙보다 먼저 맞도록 findRule 이 다시 고른다) */
export async function queryMerchantRules(ctx: Ctx): Promise<(MerchantRule & { id: string })[]> {
  const rows = await prisma.merchantCategoryRule.findMany({
    where: { householdId: ctx.householdId },
    orderBy: { merchant: "asc" },
    select: { id: true, merchantKey: true, merchant: true, categoryId: true },
  });
  return rows;
}

/** 정기 결제 찾기가 훑는 기간 — 석 달 이상 반복을 보려면 여섯 달이면 넉넉하다 */
const DETECT_DAYS = 183;

/**
 * 정기 거래로 등록하지 않았는데 매달 반복되는 내 기록 (정기 거래 화면 "이것도 매달 나가요").
 * 내가 쓴 기록만 본다 — 등록하면 내 규칙이 되므로. 배우자가 이미 등록한 사용처·"아니에요" 한 사용처는 가구 공통으로 뺀다.
 */
export async function getRecurringCandidates(ctx: Ctx, today: DateStr): Promise<RecurringCandidate[]> {
  const [rows, rules, household] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        createdByUserId: ctx.userId,
        deletedAt: null,
        type: { in: ["EXPENSE", "INCOME"] },
        merchant: { not: null },
        recurringRuleId: null,
        date: { gte: toDbDate(addDays(today, -DETECT_DAYS)), lte: toDbDate(today) },
      },
      select: {
        type: true,
        date: true,
        amount: true,
        merchant: true,
        categoryId: true,
        fromAccountId: true,
        toAccountId: true,
        visibility: true,
        recurringRuleId: true,
      },
    }),
    prisma.recurringRule.findMany({ where: { householdId: ctx.householdId }, select: { template: true } }),
    prisma.household.findUnique({ where: { id: ctx.householdId }, select: { dismissedRecurring: true } }),
  ]);
  const ruleKeys = new Set<string>();
  for (const r of rules) {
    const t = r.template as unknown as RecurringTemplate;
    if (t.merchant?.trim()) ruleKeys.add(recurringCandidateKey(t.type, t.merchant));
  }
  return findRecurringCandidates(
    rows.map((r) => ({ ...r, date: fromDbDate(r.date) })),
    { today, ruleKeys, dismissed: new Set(household?.dismissedRecurring ?? []) },
  );
}

/** 전체 기간 검색 — 최근 것부터 이만큼만 */
export const SEARCH_LIMIT = 50;

/**
 * 가계부 전체 기간 검색 (사용처·메모·카테고리 글자 또는 금액).
 * 볼 수 있는 기록만 — 배우자의 '합계만 공개'는 건별 내용을 보여 주지 않기로 했으므로 빠진다.
 */
export async function searchTransactions(ctx: Ctx, q: NonNullable<TxQuery>, scope: ViewScope): Promise<{ items: TxRow[]; more: boolean }> {
  const text = { contains: q.text, mode: "insensitive" as const };
  const rows = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      AND: [
        { OR: [{ createdByUserId: ctx.userId }, { visibility: "SHARED" }] },
        {
          OR: [
            { merchant: text },
            { memo: text },
            { category: { name: text } },
            ...(q.amount !== null ? [{ amount: q.amount }] : []),
          ],
        },
      ],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: SEARCH_LIMIT + 1,
    include: txInclude,
  });
  const items = scopeTransactions(rows.map(toRow), ctx.userId, scope).items;
  return { items: items.slice(0, SEARCH_LIMIT), more: items.length > SEARCH_LIMIT };
}
