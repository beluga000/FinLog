import "server-only";
import { isAdminEmail } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

/**
 * 서비스 관리자 화면 조회. 가계 내용(금액·거래 내역·계좌 이름)은 읽지 않는다 —
 * 운영에 필요한 건수·날짜만 본다.
 */

const DAY = 86_400_000;

export async function getAdminStats() {
  const now = Date.now();
  const [users, pending, households, couples, newUsers, active] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { approvedAt: null } }),
    prisma.household.count(),
    prisma.household.count({ where: { members: { some: { leftAt: null, role: "MEMBER" } } } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(now - 7 * DAY) } } }),
    // 최근 30일에 거래를 하나라도 기록한 가구
    prisma.transaction.groupBy({ by: ["householdId"], where: { createdAt: { gte: new Date(now - 30 * DAY) } } }),
  ]);
  return { users, pending, households, couples, newUsers, activeHouseholds: active.length };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  approvedAt: string | null;
  isAdmin: boolean;
  household: { id: string; name: string; role: "OWNER" | "MEMBER"; members: number } | null;
}

const USER_LIMIT = 200;

/** 사용자 목록 — 이메일·이름 검색, 최근 가입 순 */
export async function listUsers(q: string): Promise<{ rows: AdminUserRow[]; truncated: boolean }> {
  const term = q.trim();
  const users = await prisma.user.findMany({
    where: term
      ? { OR: [{ email: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: USER_LIMIT + 1,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      approvedAt: true,
      memberships: {
        where: { leftAt: null },
        select: {
          role: true,
          household: { select: { id: true, name: true, _count: { select: { members: { where: { leftAt: null } } } } } },
        },
      },
    },
  });
  return {
    truncated: users.length > USER_LIMIT,
    rows: users.slice(0, USER_LIMIT).map((u) => {
      const m = u.memberships[0];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        approvedAt: u.approvedAt?.toISOString() ?? null,
        isAdmin: isAdminEmail(u.email),
        household: m ? { id: m.household.id, name: m.household.name, role: m.role, members: m.household._count.members } : null,
      };
    }),
  };
}

export interface AdminHouseholdRow {
  id: string;
  name: string;
  createdAt: string;
  members: { userId: string; name: string; email: string; role: "OWNER" | "MEMBER" }[];
  txCount: number;
  lastTxAt: string | null;
}

/** 가구 목록 — 구성원, 기록 건수, 마지막 기록일 (최근 기록 순) */
export async function listHouseholds(): Promise<AdminHouseholdRow[]> {
  const [households, stats] = await Promise.all([
    prisma.household.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          where: { leftAt: null },
          orderBy: { joinedAt: "asc" },
          select: { role: true, user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.transaction.groupBy({ by: ["householdId"], where: { deletedAt: null }, _count: true, _max: { createdAt: true } }),
  ]);
  const byId = new Map(stats.map((s) => [s.householdId, s]));
  return households
    .map((h) => {
      const s = byId.get(h.id);
      return {
        id: h.id,
        name: h.name,
        createdAt: h.createdAt.toISOString(),
        members: h.members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
        txCount: s?._count ?? 0,
        lastTxAt: s?._max.createdAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.lastTxAt ?? b.createdAt).localeCompare(a.lastTxAt ?? a.createdAt));
}
