"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { computeSpendable, getSpendableSource } from "@/features/dashboard/home";
import { getGoalsOverview } from "@/features/goals/queries";
import { requireHousehold, type HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma, toDbDate } from "@/lib/db/prisma";
import { addDays, getMonthKey, getMonthRange, inRange, todayKST } from "@/lib/finance/period";
import { txAccess } from "@/lib/finance/visibility";
import { recurringInputSchema, type ActionResult } from "./schema";
import { materializeRecurring, resolveTxInput } from "./service";
import { SHARED_TEXT_COOKIE } from "./shared-text";
import type { RecurringTemplate } from "./queries";

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
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  done();
  return { ok: true };
}

export async function createRecurringRule(raw: unknown): Promise<ActionResult<{ created: number }>> {
  const ctx = await requireHousehold();
  const parsed = recurringInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
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
  await prisma.recurringRule.create({
    data: {
      householdId: ctx.householdId,
      createdByUserId: ctx.userId,
      name: parsed.data.name,
      template: template as object,
      dayOfMonth: parsed.data.dayOfMonth,
      businessDayAdjust: parsed.data.businessDayAdjust,
      startDate: toDbDate(parsed.data.startDate),
      endDate: parsed.data.endDate ? toDbDate(parsed.data.endDate) : null,
    },
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

export interface PastedExpenseInfo {
  /** 같은 금액·±1일 기존 지출 (AC-23) */
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
  if (!/^\d+$/.test(input.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { duplicate: null, categoryId: null };
  const visible = { householdId: ctx.householdId, deletedAt: null, type: "EXPENSE" as const, OR: [{ createdByUserId: ctx.userId }, { visibility: { not: "PRIVATE" as const } }] };
  const [dup, sameMerchant] = await Promise.all([
    prisma.transaction.findFirst({
      where: {
        ...visible,
        amount: BigInt(input.amount),
        date: { gte: toDbDate(addDays(input.date, -1)), lte: toDbDate(addDays(input.date, 1)) },
      },
      select: { date: true, merchant: true, amount: true },
    }),
    input.merchant
      ? prisma.transaction.findFirst({
          where: { ...visible, merchant: input.merchant, categoryId: { not: null } },
          orderBy: { date: "desc" },
          select: { categoryId: true },
        })
      : null,
  ]);
  return {
    duplicate: dup ? { date: fromDbDate(dup.date), merchant: dup.merchant, amount: dup.amount } : null,
    categoryId: sameMerchant?.categoryId ?? null,
  };
}
