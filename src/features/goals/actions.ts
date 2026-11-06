"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { amountStr, type ActionResult } from "@/features/ledger/schema";
import { getAccounts } from "@/features/ledger/queries";
import { getGoalBasis } from "@/features/goals/queries";
import { requireHousehold } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { clampStartAmount, MILESTONES, reachedMilestone } from "@/lib/finance/goals";
import { todayKST } from "@/lib/finance/period";

const goalSchema = z.object({
  name: z.string().trim().min(1, "목표 이름을 입력하세요.").max(30),
  targetAmount: amountStr,
  targetIsReal: z.boolean(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "목표일을 선택하세요."),
  expectedReturn: z.number().min(-0.1).max(0.2),
  linkedAccountIds: z.array(z.string()).max(20),
  monthlyCommit: amountStr.nullable(),
  /** 기존 잔액 중 이 목표 몫 — 0 허용 */
  startAmount: z.string().regex(/^\d+$/, "이미 모은 돈은 숫자만 입력하세요."),
});

/** 시작 금액과 그때의 기준 잔액 — 저장할 때마다 다시 잡는다 (수정 창은 지금 모인 돈을 시작 금액으로 채워 보낸다) */
async function startOf(ctx: { householdId: string; userId: string }, linkedIds: string[], startAmount: string | number, target: number) {
  const basis = await getGoalBasis(ctx, linkedIds);
  const start = clampStartAmount(Number(startAmount), basis);
  return {
    startAmount: BigInt(Math.round(start)),
    baseBalance: BigInt(Math.round(basis)),
    baseSetOn: toDbDate(todayKST()),
    // 이미 넘어 있는 단계는 알리지 않는다 (시작부터 60%면 "절반 왔어요"가 뜨지 않게)
    milestoneSeen: target > 0 ? reachedMilestone(start / target) : 0,
  };
}

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
  const linkedAccountIds = await validLinked(ctx, d.linkedAccountIds);
  const goal = await prisma.assetGoal.create({
    data: {
      householdId: ctx.householdId,
      name: d.name,
      targetAmount: BigInt(d.targetAmount),
      targetIsReal: d.targetIsReal,
      targetDate: toDbDate(d.targetDate),
      expectedReturn: d.expectedReturn,
      linkedAccountIds,
      ...(await startOf(ctx, linkedAccountIds, d.startAmount, Number(d.targetAmount))),
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
  const linkedAccountIds = await validLinked(ctx, d.linkedAccountIds);
  await prisma.assetGoal.update({
    where: { id },
    data: {
      name: d.name,
      targetAmount: BigInt(d.targetAmount),
      targetIsReal: d.targetIsReal,
      targetDate: toDbDate(d.targetDate),
      expectedReturn: d.expectedReturn,
      linkedAccountIds,
      ...(await startOf(ctx, linkedAccountIds, d.startAmount, Number(d.targetAmount))),
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

/** "만약에" 패널 "이 계획으로 바꾸기" — 월 저축 확정액·기대수익률·목표일을 한 번에 저장 (§4-1, AC-15) */
export async function applyGoalPlan(
  id: string,
  plan: { monthlyCommit: string; expectedReturn: number; targetDate: string },
): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (!(await findGoal(ctx.householdId, id))) return { ok: false, error: "목표를 찾을 수 없습니다." };
  const parsed = z
    .object({
      monthlyCommit: z.string().regex(/^\d+$/, "금액은 숫자만 입력하세요."),
      expectedReturn: goalSchema.shape.expectedReturn,
      targetDate: goalSchema.shape.targetDate,
    })
    .safeParse(plan);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  if (d.targetDate <= todayKST()) return { ok: false, error: "목표일은 오늘 이후여야 합니다." };
  await prisma.assetGoal.update({
    where: { id },
    data: { monthlyCommit: BigInt(d.monthlyCommit), expectedReturn: d.expectedReturn, targetDate: toDbDate(d.targetDate) },
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

/**
 * 우선순위 한 칸 위/아래로.
 * overActive: 바로 위 "진행 중" 목표 위로 올린다 (사이의 일시정지·달성 목표는 건너뜀) — 목표 상세 대안 (d), simulatePriorityRaise 와 같은 기준.
 */
export async function moveGoalPriority(id: string, direction: "up" | "down", opts: { overActive?: boolean } = {}): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const goals = await prisma.assetGoal.findMany({ where: { householdId: ctx.householdId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  const i = goals.findIndex((g) => g.id === id);
  let j = direction === "up" ? i - 1 : i + 1;
  if (opts.overActive && direction === "up") while (j >= 0 && goals[j].status !== "ACTIVE") j--;
  if (i < 0 || j < 0 || j >= goals.length) return { ok: true };
  const [me] = goals.splice(i, 1);
  goals.splice(j, 0, me);
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

/** 목표 상세에서 "이미 모은 돈"만 바로 고친다 — 오늘 잔액을 기준으로 다시 센다 */
export async function setGoalStartAmount(id: string, amount: string): Promise<ActionResult<{ startAmount: number }>> {
  const ctx = await requireHousehold();
  const goal = await findGoal(ctx.householdId, id);
  if (!goal) return { ok: false, error: "목표를 찾을 수 없습니다." };
  if (!/^\d+$/.test(amount)) return { ok: false, error: "금액은 숫자만 입력하세요." };
  const linkedAccountIds = await validLinked(ctx, goal.linkedAccountIds);
  const data = await startOf(ctx, linkedAccountIds, amount, Number(goal.targetAmount));
  await prisma.assetGoal.update({ where: { id }, data: { ...data, milestoneSeen: Math.max(goal.milestoneSeen, data.milestoneSeen) } });
  revalidatePath("/", "layout");
  return { ok: true, data: { startAmount: Number(data.startAmount) } };
}

/** 홈 진행률 알림을 닫는다 — 그 단계까지 본 것으로 기록 */
export async function dismissGoalMilestone(id: string, milestone: number): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const goal = await findGoal(ctx.householdId, id);
  if (!goal) return { ok: false, error: "목표를 찾을 수 없습니다." };
  if (!(MILESTONES as readonly number[]).includes(milestone)) return { ok: false, error: "단계를 확인하세요." };
  await prisma.assetGoal.update({ where: { id }, data: { milestoneSeen: Math.max(goal.milestoneSeen, milestone) } });
  revalidatePath("/", "layout");
  return { ok: true };
}
