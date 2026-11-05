"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { computeSpendable, getSpendableSource } from "@/features/dashboard/home";
import { getGoalsOverview } from "@/features/goals/queries";
import { requireHousehold, writeAudit, type HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { importKeys } from "@/lib/finance/capture-import";
import { addDays, getMonthKey, getMonthRange, inRange, todayKST } from "@/lib/finance/period";
import { lastRunAfterScheduleChange } from "@/lib/finance/recurring";
import { TX_TYPES_ORDER } from "@/lib/finance/tx-rules";
import type { TxType } from "@/lib/finance/types";
import { txAccess } from "@/lib/finance/visibility";
import { recurringInputSchema, type ActionResult } from "./schema";
import { materializeRecurring, resolveTxInput } from "./service";
import { SHARED_TEXT_COOKIE } from "./shared-text";
import { queryMerchantSuggestions, type MerchantSuggestion, type RecurringTemplate } from "./queries";

function done() {
  revalidatePath("/", "layout");
}

export interface SpendableChange {
  before: bigint;
  after: bigint;
  daily: bigint;
}

export async function createTransaction(
  raw: unknown,
): Promise<ActionResult<{ id: string; spendable: SpendableChange | null }>> {
  const ctx = await requireHousehold();
  const resolved = await resolveTxInput(ctx, raw);
  if (!resolved.ok) return resolved;
  const { date, ...data } = resolved.data;
  const tx = await prisma.transaction.create({
    data: { ...data, date: toDbDate(date!), householdId: ctx.householdId, createdByUserId: ctx.userId, paidByUserId: ctx.userId },
  });
  const spendable = await spendableChange(ctx, tx.id, date!);
  done();
  return { ok: true, data: { id: tx.id, spendable } };
}

/**
 * 기록 피드백 (AC-13): 이번 달 거래면 저장 전후 쓸 수 있는 돈("우리" 기준).
 * 저장 후 한 번만 조회하고 "전"은 방금 만든 거래를 빼고 다시 계산한다.
 */
async function spendableChange(ctx: HouseholdContext, txId: string, date: string): Promise<SpendableChange | null> {
  const today = todayKST();
  const { monthStartDay } = ctx.household;
  if (!inRange(date, getMonthRange(getMonthKey(today, monthStartDay), monthStartDay))) return null;
  const { goals } = await getGoalsOverview(ctx, { today, monthStartDay });
  const source = await getSpendableSource(ctx, "us", { today, monthStartDay, goals });
  const before = computeSpendable(source, { excludeTxId: txId });
  const after = computeSpendable(source);
  if (before.remaining === after.remaining) return null;
  return { before: before.remaining, after: after.remaining, daily: after.daily };
}

/** 편집 권한: 내가 볼 수 있고(full) — 내 거래이거나 공유(SHARED) 거래 */
async function findEditable(ctx: { householdId: string; userId: string }, id: string) {
  const tx = await prisma.transaction.findFirst({ where: { id, householdId: ctx.householdId, deletedAt: null } });
  if (!tx || txAccess(tx, ctx.userId, "us") !== "full") return null;
  return tx;
}

export async function updateTransaction(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const existing = await findEditable(ctx, id);
  if (!existing) return { ok: false, error: "거래를 찾을 수 없습니다." };
  const resolved = await resolveTxInput(ctx, raw);
  if (!resolved.ok) return resolved;
  const { date, ...data } = resolved.data;
  // 공개범위는 작성자만 바꿀 수 있다
  const visibility = existing.createdByUserId === ctx.userId ? data.visibility : existing.visibility;
  // 정기거래 금액 수정 = 확인한 것으로 본다 (§2-10)
  await prisma.transaction.update({ where: { id }, data: { ...data, visibility, date: toDbDate(date!), needsReview: false } });
  done();
  return { ok: true };
}

/** 확인할 일 [맞아요] — 정기거래 확인 플래그 해제 */
export async function confirmTransaction(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const existing = await findEditable(ctx, id);
  if (!existing) return { ok: false, error: "거래를 찾을 수 없습니다." };
  await prisma.transaction.update({ where: { id }, data: { needsReview: false } });
  done();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const existing = await findEditable(ctx, id);
  if (!existing) return { ok: false, error: "거래를 찾을 수 없습니다." };
  // 가져오기 열쇠는 비운다 — 지운 뒤 같은 캡처를 다시 가져오면 다시 기록되게
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date(), importHash: null } });
  done();
  return { ok: true };
}

/** 입력 검증 + 계좌·분류 확인 → 규칙 템플릿 (추가·수정 공용) */
async function parseRecurring(ctx: HouseholdContext, raw: unknown) {
  const parsed = recurringInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    return { ok: false as const, error: "종료일은 시작일 이후여야 합니다." };
  }
  const resolved = await resolveTxInput(ctx, parsed.data.tx, { omitDate: true });
  if (!resolved.ok) return resolved;
  const r = resolved.data;
  const template: RecurringTemplate = {
    type: r.type,
    amount: r.amount.toString(),
    fromAccountId: r.fromAccountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    merchant: r.merchant,
    memo: r.memo,
    visibility: r.visibility,
  };
  return { ok: true as const, input: parsed.data, template };
}

export async function createRecurringRule(raw: unknown): Promise<ActionResult<{ created: number }>> {
  const ctx = await requireHousehold();
  const p = await parseRecurring(ctx, raw);
  if (!p.ok) return p;
  const { input, template } = p;
  await prisma.recurringRule.create({
    data: {
      householdId: ctx.householdId,
      createdByUserId: ctx.userId,
      name: input.name,
      template: template as object,
      dayOfMonth: input.dayOfMonth,
      businessDayAdjust: input.businessDayAdjust,
      startDate: toDbDate(input.startDate),
      endDate: input.endDate ? toDbDate(input.endDate) : null,
    },
  });
  const created = await materializeRecurring(ctx.householdId, todayKST());
  done();
  return { ok: true, data: { created } };
}

/**
 * 규칙 수정 — 이미 생성된 거래는 그대로 두고 다음 회차부터 반영한다.
 * 날짜(매월 N일·주말 보정)가 바뀌면 이미 나간 달에 새 날짜로 한 번 더 생성되지 않게 마지막 실행일을 보정한다.
 */
export async function updateRecurringRule(id: string, raw: unknown): Promise<ActionResult<{ created: number }>> {
  const ctx = await requireHousehold();
  const rule = await findOwnRule(ctx, id);
  if (!rule) return { ok: false, error: "본인이 만든 규칙만 수정할 수 있습니다." };
  const p = await parseRecurring(ctx, raw);
  if (!p.ok) return p;
  const { input, template } = p;
  const scheduleChanged = rule.dayOfMonth !== input.dayOfMonth || rule.businessDayAdjust !== input.businessDayAdjust;
  const lastRunOn =
    rule.lastRunOn && scheduleChanged
      ? toDbDate(lastRunAfterScheduleChange(rule, input, fromDbDate(rule.lastRunOn)))
      : rule.lastRunOn;
  await prisma.recurringRule.update({
    where: { id },
    data: {
      name: input.name,
      template: template as object,
      dayOfMonth: input.dayOfMonth,
      businessDayAdjust: input.businessDayAdjust,
      startDate: toDbDate(input.startDate),
      endDate: input.endDate ? toDbDate(input.endDate) : null,
      lastRunOn,
    },
  });
  await writeAudit(ctx, "RECURRING_UPDATE", "RecurringRule", id, {
    before: { name: rule.name, template: rule.template, dayOfMonth: rule.dayOfMonth, businessDayAdjust: rule.businessDayAdjust },
    after: { name: input.name, template, dayOfMonth: input.dayOfMonth, businessDayAdjust: input.businessDayAdjust },
  });
  const created = await materializeRecurring(ctx.householdId, todayKST());
  done();
  return { ok: true, data: { created } };
}

async function findOwnRule(ctx: { householdId: string; userId: string }, id: string) {
  return prisma.recurringRule.findFirst({ where: { id, householdId: ctx.householdId, createdByUserId: ctx.userId } });
}

export async function setRecurringRuleActive(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const rule = await findOwnRule(ctx, id);
  if (!rule) return { ok: false, error: "본인이 만든 규칙만 변경할 수 있습니다." };
  await prisma.recurringRule.update({ where: { id }, data: { isActive } });
  done();
  return { ok: true };
}

/** 규칙 삭제 — 이미 생성된 거래는 남긴다 (recurringRuleId 는 SetNull) */
export async function deleteRecurringRule(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const rule = await findOwnRule(ctx, id);
  if (!rule) return { ok: false, error: "본인이 만든 규칙만 삭제할 수 있습니다." };
  await prisma.recurringRule.delete({ where: { id } });
  done();
  return { ok: true };
}

/** 공유받기 쿠키를 한 번 읽고 지운다 (AC-22) */
export async function consumeSharedText(): Promise<void> {
  (await cookies()).delete(SHARED_TEXT_COOKIE);
}

/**
 * 사용처 자동완성 — 이 유형의 최근 거래에서 자주 쓴 사용처와 그곳에 마지막으로 쓴 카테고리·계좌.
 * 배우자 거래는 '공유'만 본다 (queryMerchantSuggestions 참고).
 */
export async function getMerchantSuggestions(type: string): Promise<MerchantSuggestion[]> {
  const ctx = await requireHousehold();
  if (!(TX_TYPES_ORDER as readonly string[]).includes(type)) return [];
  return queryMerchantSuggestions(ctx, type as TxType);
}

export interface PastedExpenseInfo {
  /** 같은 금액 기존 지출 — 문자 붙여넣기는 ±1일, 캡처는 같은 날 (AC-23, AC-23a) */
  duplicate: { date: string; merchant: string | null; amount: bigint } | null;
  /** 같은 가맹점에 최근 쓴 카테고리 */
  categoryId: string | null;
}

/** 문자로 채운 지출 점검 — 중복 후보와 가맹점별 최근 카테고리. 내가 볼 수 있는 거래만 본다 */
export async function inspectPastedExpense(input: {
  amount: string;
  date: string;
  merchant: string | null;
}): Promise<PastedExpenseInfo> {
  const ctx = await requireHousehold();
  return (await inspectExpenses(ctx, [input]))[0];
}

const BULK_MAX = 50;

/** 캡처로 채운 여러 건 점검 — 건마다 중복 후보와 가맹점별 최근 카테고리 (쿼리 두 번) */
export async function inspectCapturedExpenses(
  items: { amount: string; date: string; merchant: string | null }[],
): Promise<PastedExpenseInfo[]> {
  const ctx = await requireHousehold();
  if (!Array.isArray(items) || items.length > BULK_MAX) return [];
  // 캡처 날짜는 카드 앱에 찍힌 그대로라 같은 날만 본다 — ±1일이면 매일 같은 금액(편의점·커피)이 전날 기록에 걸린다
  return inspectExpenses(ctx, items, 0);
}

/**
 * windowDays: 앞뒤로 볼 날 수 (문자 붙여넣기 1, 캡처 0).
 * 기존 기록 하나는 한 건에만 맞춘다 — 같은 날 같은 금액이 두 번이면 기록이 하나뿐일 때 한 건만 의심한다.
 */
async function inspectExpenses(
  ctx: HouseholdContext,
  items: { amount: string; date: string; merchant: string | null }[],
  windowDays = 1,
): Promise<PastedExpenseInfo[]> {
  const valid = (i: { amount: unknown; date: unknown }) =>
    typeof i.amount === "string" && /^\d{1,13}$/.test(i.amount) && typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date);
  const ok = items.filter(valid);
  if (!ok.length) return items.map(() => ({ duplicate: null, categoryId: null }));
  const visible = { householdId: ctx.householdId, deletedAt: null, type: "EXPENSE" as const, OR: [{ createdByUserId: ctx.userId }, { visibility: { not: "PRIVATE" as const } }] };
  const dates = ok.map((i) => i.date).sort();
  const merchants = [...new Set(ok.map((i) => (typeof i.merchant === "string" ? i.merchant.trim() : "")).filter(Boolean))];
  const [candidates, lastCategories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...visible,
        amount: { in: [...new Set(ok.map((i) => i.amount))].map(BigInt) },
        date: { gte: toDbDate(addDays(dates[0], -windowDays)), lte: toDbDate(addDays(dates[dates.length - 1], windowDays)) },
      },
      orderBy: { date: "asc" },
      select: { date: true, merchant: true, amount: true },
    }),
    merchants.length
      ? prisma.transaction.findMany({
          where: { ...visible, merchant: { in: merchants }, categoryId: { not: null } },
          orderBy: { date: "desc" },
          distinct: ["merchant"],
          select: { merchant: true, categoryId: true },
        })
      : [],
  ]);
  const existing = candidates.map((t) => ({ date: fromDbDate(t.date), merchant: t.merchant, amount: t.amount }));
  const categoryOf = new Map(lastCategories.map((c) => [c.merchant, c.categoryId]));
  const used = new Set<number>();
  return items.map((i) => {
    if (!valid(i)) return { duplicate: null, categoryId: null };
    const amount = BigInt(i.amount);
    const lo = addDays(i.date, -windowDays);
    const hi = addDays(i.date, windowDays);
    const merchant = i.merchant?.trim() || null;
    const fits = (t: (typeof existing)[number], k: number) => !used.has(k) && t.amount === amount && t.date >= lo && t.date <= hi;
    // 같은 날·같은 가맹점 기록을 먼저 맞춘다
    let k = existing.findIndex((t, n) => fits(t, n) && t.date === i.date && t.merchant === merchant);
    if (k < 0) k = existing.findIndex(fits);
    if (k >= 0) used.add(k);
    return { duplicate: k >= 0 ? existing[k] : null, categoryId: (merchant && categoryOf.get(merchant)) || null };
  });
}

export interface BulkExpenseRow {
  date: string;
  amount: string;
  merchant: string | null;
  categoryId: string | null;
  fromAccountId: string | null;
  memo: string | null;
}

/**
 * 캡처로 채운 지출 여러 건을 한 번에 기록 (§2-5 모바일 수집).
 * 건마다 createTransaction 과 같은 검증(resolveTxInput)을 거치고, 하나라도 틀리면 아무것도 저장하지 않는다.
 * importHash = sha256(가구|날짜|금액|사용처|계좌|같은 값 순번) — 같은 캡처를 다시 가져오면 이미 있는 건은 건너뛴다.
 * 서버로 오는 것은 거래 값뿐이다 (이미지·인식 원문 줄은 브라우저에만 있다).
 */
export async function createTransactionsBulk(rows: BulkExpenseRow[]): Promise<ActionResult<{ created: number; skipped: number }>> {
  const ctx = await requireHousehold();
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "기록할 거래가 없습니다." };
  if (rows.length > BULK_MAX) return { ok: false, error: `한 번에 ${BULK_MAX}건까지 기록할 수 있습니다.` };
  const resolved = [];
  for (const [i, raw] of rows.entries()) {
    const row = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof BulkExpenseRow, unknown>>;
    const r = await resolveTxInput(ctx, {
      type: "EXPENSE",
      date: row.date,
      amount: row.amount,
      fromAccountId: row.fromAccountId ?? null,
      toAccountId: null,
      categoryId: row.categoryId ?? null,
      merchant: row.merchant ?? null,
      memo: row.memo ?? null,
      visibility: null,
      isFixed: false,
    });
    if (!r.ok) return { ok: false, error: `${i + 1}번째 거래: ${r.error}` };
    resolved.push(r.data);
  }
  const keys = importKeys(
    ctx.householdId,
    resolved.map((r) => ({ date: r.date!, amount: r.amount, merchant: r.merchant, accountId: r.fromAccountId })),
  );
  const { count } = await prisma.transaction.createMany({
    data: resolved.map(({ date, ...data }, i) => ({
      ...data,
      date: toDbDate(date!),
      householdId: ctx.householdId,
      createdByUserId: ctx.userId,
      paidByUserId: ctx.userId,
      importHash: createHash("sha256").update(keys[i]).digest("hex"),
    })),
    skipDuplicates: true,
  });
  done();
  return { ok: true, data: { created: count, skipped: rows.length - count } };
}
