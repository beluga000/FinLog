import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";

/** v3: 시뮬레이터는 목표 상세의 "만약에" 패널로 통합 — 대표 목표로 보낸다 (§4-1, AC-17) */
export default async function SimulatePage() {
  const ctx = await requireHousehold();
  const primary = await prisma.assetGoal.findFirst({
    where: { householdId: ctx.householdId, status: "ACTIVE" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  redirect(primary ? `/goals/${primary.id}#what-if` : "/goals");
}
