"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { amountStr, type ActionResult } from "@/features/ledger/schema";
import { getAccounts } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { todayKST } from "@/lib/finance/period";

const goalSchema = z.object({
  name: z.string().trim().min(1, "목표 이름을 입력하세요.").max(30),
  targetAmount: amountStr,
  targetIsReal: z.boolean(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "목표일을 선택하세요."),
  expectedReturn: z.number().min(-0.1).max(0.2),
  linkedAccountIds: z.array(z.string()).max(20),
  monthlyCommit: amountStr.nullable(),
});

async function validLinked(ctx: { householdId: string; userId: string }, ids: string[]) {
  const visible = new Set((await getAccounts(ctx, "us")).map((a) => a.id));
  return ids.filter((id) => visible.has(id));
}

export async function createGoal(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireHousehold();
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  if (d.targetDate <= todayKST()) return { ok: false, error: "목표일은 오늘 이후여야 합니다." };
  const max = await prisma.assetGoal.aggregate({ where: { householdId: ctx.householdId }, _max: { priority: true } });
  const goal = await prisma.assetGoal.create({
    data: {
      householdId: ctx.householdId,
      name: d.name,
      targetAmount: BigInt(d.targetAmount),
      targetIsReal: d.targetIsReal,
      targetDate: toDbDate(d.targetDate),
      expectedReturn: d.expectedReturn,
      linkedAccountIds: await validLinked(ctx, d.linkedAccountIds),
      monthlyCommit: d.monthlyCommit ? BigInt(d.monthlyCommit) : null,
      priority: (max._max.priority ?? 0) + 1,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { id: goal.id } };
}

async function findGoal(householdId: string, id: string) {
  return prisma.assetGoal.findFirst({ where: { id, householdId } });
}

export async function updateGoal(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return { ok: false, error: "목표를 찾을 수 없습니다." };
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  await prisma.assetGoal.update({
    where: { id },
    data: {
      name: d.name,
      targetAmount: BigInt(d.targetAmount),
      targetIsReal: d.targetIsReal,
      targetDate: toDbDate(d.targetDate),
      expectedReturn: d.expectedReturn,
      linkedAccountIds: await validLinked(ctx, d.linkedAccountIds),
      monthlyCommit: d.monthlyCommit ? BigInt(d.monthlyCommit) : null,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 추천 납입액을 "확정"하거나(금액) 확정을 해제(null) */
export async function setGoalCommit(id: string, monthly: string | null): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return { ok: false, error: "목표를 찾을 수 없습니다." };
  const parsed = amountStr.nullable().safeParse(monthly);
  if (!parsed.success) return { ok: false, error: "금액을 확인하세요." };
  await prisma.assetGoal.update({ where: { id }, data: { monthlyCommit: parsed.data ? BigInt(parsed.data) : null } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 대안 적용: 목표일 또는 목표액 변경 */
export async function applyGoalAlternative(
  id: string,
  change: { targetDate?: string; targetAmount?: string; expectedReturn?: number },
): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return { ok: false, error: "목표를 찾을 수 없습니다." };
  const parsed = z
    .object({
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      targetAmount: amountStr.optional(),
      expectedReturn: z.number().min(-0.1).max(0.2).optional(),
    })
    .safeParse(change);
  if (!parsed.success) return { ok: false, error: "변경값을 확인하세요." };
  const d = parsed.data;
  await prisma.assetGoal.update({
    where: { id },
    data: {
      ...(d.targetDate ? { targetDate: toDbDate(d.targetDate) } : {}),
      ...(d.targetAmount ? { targetAmount: BigInt(d.targetAmount) } : {}),
      ...(d.expectedReturn !== undefined ? { expectedReturn: d.expectedReturn } : {}),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setGoalStatus(id: string, status: "ACTIVE" | "ACHIEVED" | "PAUSED"): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return { ok: false, error: "목표를 찾을 수 없습니다." };
  await prisma.assetGoal.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 우선순위 한 칸 위/아래로 */
export async function moveGoalPriority(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const goals = await prisma.assetGoal.findMany({ where: { householdId: ctx.householdId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  const i = goals.findIndex((g) => g.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= goals.length) return { ok: true };
  [goals[i], goals[j]] = [goals[j], goals[i]];
  await prisma.$transaction(goals.map((g, idx) => prisma.assetGoal.update({ where: { id: g.id }, data: { priority: idx + 1 } })));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return;
  await prisma.assetGoal.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/goals");
}
