"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { todayKST } from "@/lib/finance/period";
import { txAccess } from "@/lib/finance/visibility";
import { recurringInputSchema, type ActionResult } from "./schema";
import { materializeRecurring, resolveTxInput } from "./service";
import type { RecurringTemplate } from "./queries";

function done() {
  revalidatePath("/", "layout");
}

export async function createTransaction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireHousehold();
  const resolved = await resolveTxInput(ctx, raw);
  if (!resolved.ok) return resolved;
  const { date, ...data } = resolved.data;
  const tx = await prisma.transaction.create({
    data: { ...data, date: toDbDate(date!), householdId: ctx.householdId, createdByUserId: ctx.userId, paidByUserId: ctx.userId },
  });
  done();
  return { ok: true, data: { id: tx.id } };
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
  await prisma.transaction.update({ where: { id }, data: { ...data, visibility, date: toDbDate(date!) } });
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
