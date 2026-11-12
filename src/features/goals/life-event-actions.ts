"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { LIFE_EVENT_KINDS } from "@/lib/finance/life-events";

const MAX_EVENTS = 20;
const MAX_WON = 10_000_000_000; // 100억

const schema = z
  .object({
    kind: z.enum(LIFE_EVENT_KINDS),
    label: z.string().trim().max(20).default(""),
    startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "시작 달을 고르세요."),
    monthly: z.number().int().min(-MAX_WON).max(MAX_WON),
    months: z.number().int().min(1).max(600).nullable(),
    oneTime: z.number().int().min(0).max(MAX_WON),
  })
  .refine((v) => v.monthly !== 0 || v.oneTime > 0, { message: "매달 바뀌는 돈이나 한 번에 나가는 돈 중 하나는 입력하세요." });

/** 생활 변화 추가 — 가구 공동 (목표처럼 둘 다 보고 고친다) */
export async function createLifeEvent(raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const count = await prisma.lifeEvent.count({ where: { householdId: ctx.householdId } });
  if (count >= MAX_EVENTS) return { ok: false, error: `생활 변화는 ${MAX_EVENTS}개까지 넣을 수 있어요.` };
  const { kind, startMonth, ...params } = parsed.data;
  await prisma.lifeEvent.create({ data: { householdId: ctx.householdId, kind, startMonth, params } });
  revalidatePath("/goals", "layout");
  return { ok: true };
}

export async function deleteLifeEvent(id: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (typeof id !== "string") return { ok: false, error: "잘못된 요청입니다." };
  const r = await prisma.lifeEvent.deleteMany({ where: { id, householdId: ctx.householdId } });
  if (!r.count) return { ok: false, error: "이미 지워졌어요." };
  revalidatePath("/goals", "layout");
  return { ok: true };
}
