import "server-only";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";
import { getViewer } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";

/** 관리자만 통과. 그 외에는 관리자 화면이 있다는 것도 알리지 않도록 404 */
export async function requireAdmin() {
  const { user } = await getViewer();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

export async function getSignupQueues() {
  const [pending, approved] = await Promise.all([
    prisma.user.findMany({
      where: { approvedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: { id: true, name: true, email: true, approvedAt: true },
    }),
  ]);
  return {
    pending: pending.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approved: approved
      .filter((u) => !isAdminEmail(u.email))
      .map((u) => ({ ...u, approvedAt: u.approvedAt!.toISOString() })),
  };
}

/** 헤더 메뉴 배지용: 관리자면 대기 건수, 아니면 null */
export async function getPendingCountForAdmin(email: string | null | undefined): Promise<number | null> {
  if (!isAdminEmail(email)) return null;
  return prisma.user.count({ where: { approvedAt: null } });
}
