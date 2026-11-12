"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { requireHousehold, writeAudit } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { getSettlement } from "./settlement";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** 정산 나누는 방식 (가구에 하나). CUSTOM 은 첫 번째 구성원(가입 순) 몫 % */
export async function saveSplitRule(raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!ctx.isCouple) return { ok: false, error: "배우자와 연결된 뒤에 쓸 수 있어요." };
  const parsed = z
    .object({ method: z.enum(["EQUAL", "INCOME_RATIO", "CUSTOM"]), percentFirst: z.number().int().min(0).max(100).nullable() })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력값을 확인하세요." };
  const { method, percentFirst } = parsed.data;
  if (method === "CUSTOM" && percentFirst === null) return { ok: false, error: "비율을 입력하세요." };
  const [first, second] = ctx.members;
  const ratios = method === "CUSTOM" ? { [first.id]: percentFirst!, [second.id]: 100 - percentFirst! } : undefined;

  await prisma.$transaction(async (db) => {
    await db.splitRule.deleteMany({ where: { householdId: ctx.householdId } });
    await db.splitRule.create({ data: { householdId: ctx.householdId, method, ratios } });
  });
  await writeAudit(ctx, "SPLIT_RULE_UPDATE", "SplitRule", ctx.householdId, { method });
  revalidatePath("/reports", "layout");
  return { ok: true };
}

/** 이 달 정산 완료로 표시 — 지금 계산한 금액을 그대로 남긴다 (나중에 기록이 바뀌면 화면에서 차이를 알려 준다) */
export async function markSettled(month: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "잘못된 요청입니다." };
  const s = await getSettlement(ctx, m.data);
  if (!s) return { ok: false, error: "배우자와 연결된 뒤에 쓸 수 있어요." };
  if (!s.result.transfer) return { ok: false, error: "맞출 금액이 없어요." };
  const { from, to, amount } = s.result.transfer;
  await prisma.settlement.upsert({
    where: { householdId_month: { householdId: ctx.householdId, month: m.data } },
    create: { householdId: ctx.householdId, month: m.data, fromUserId: from, toUserId: to, amount, settledAt: new Date() },
    update: { fromUserId: from, toUserId: to, amount, settledAt: new Date() },
  });
  await writeAudit(ctx, "SETTLEMENT_DONE", "Settlement", ctx.householdId, { month: m.data });
  revalidatePath("/reports", "layout");
  return { ok: true };
}

export async function undoSettlement(month: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const m = monthSchema.safeParse(month);
  if (!m.success) return { ok: false, error: "잘못된 요청입니다." };
  const r = await prisma.settlement.deleteMany({ where: { householdId: ctx.householdId, month: m.data } });
  if (!r.count) return { ok: false, error: "정산 완료 기록이 없어요." };
  await writeAudit(ctx, "SETTLEMENT_UNDO", "Settlement", ctx.householdId, { month: m.data });
  revalidatePath("/reports", "layout");
  return { ok: true };
}
