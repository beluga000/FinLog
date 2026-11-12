import "server-only";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { LIFE_EVENT_KINDS, type LifeEventInput, type LifeEventKind } from "@/lib/finance/life-events";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 가구 생활 변화 — 시작 달 순 */
export async function getLifeEvents(ctx: Pick<HouseholdContext, "householdId">): Promise<LifeEventInput[]> {
  const rows = await prisma.lifeEvent.findMany({ where: { householdId: ctx.householdId }, orderBy: [{ startMonth: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => {
    const p = (r.params ?? {}) as Record<string, unknown>;
    const kind = (LIFE_EVENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as LifeEventKind) : "OTHER";
    return {
      id: r.id,
      kind,
      label: typeof p.label === "string" ? p.label : "",
      startMonth: r.startMonth,
      monthly: num(p.monthly),
      months: typeof p.months === "number" ? p.months : null,
      oneTime: num(p.oneTime),
    };
  });
}
