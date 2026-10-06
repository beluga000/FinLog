import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "./prisma";

/**
 * 요청 단위 사용자·가구 컨텍스트. 모든 도메인 조회/변경은 여기서 얻은 householdId 로만 수행한다.
 * (클라이언트가 보낸 householdId 는 절대 신뢰하지 않는다)
 */

export const getViewer = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) redirect("/login");

  const membership = await prisma.householdMember.findFirst({
    where: { userId, leftAt: null },
    include: {
      household: {
        include: {
          members: {
            where: { leftAt: null },
            orderBy: { joinedAt: "asc" },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
  return { user, membership };
});

export type HouseholdContext = Awaited<ReturnType<typeof requireHousehold>>;

export const requireHousehold = cache(async () => {
  const { user, membership } = await getViewer();
  if (!membership) redirect("/onboarding");
  const { household } = membership;
  const members = household.members.map((m) => ({ ...m.user, role: m.role }));
  const partner = members.find((m) => m.id !== user.id) ?? null;
  return {
    userId: user.id,
    user,
    householdId: household.id,
    household: {
      id: household.id,
      name: household.name,
      monthStartDay: household.monthStartDay,
      emergencyMonths: household.emergencyMonths,
    },
    role: membership.role,
    members,
    partner,
    isCouple: members.length > 1,
  };
});

export async function writeAudit(
  ctx: { householdId: string; userId: string },
  action: string,
  entity: string,
  entityId: string,
  diff?: object,
) {
  await prisma.auditLog.create({
    data: { householdId: ctx.householdId, userId: ctx.userId, action, entity, entityId, diff: diff ?? undefined },
  });
}
