"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/features/admin/access";
import { deleteUserAccount, detachImpact, detachMember } from "@/features/admin/delete-user";
import type { ActionResult } from "@/features/ledger/schema";
import { signIn, signOut } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth/admin";
import { getViewer } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { clientIp, consumeLimit, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import { hashResetToken, isResetTokenShape, newResetToken, RESET_TTL_MS } from "./reset-token";

const newPassword = z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72, "비밀번호는 72자까지 쓸 수 있어요.");

/**
 * 본인 확인: 비밀번호가 있는 계정은 현재 비밀번호, 소셜 로그인만 쓰는 계정은 이메일을 그대로 입력.
 * 대입 방지로 사람마다 15분에 5번까지.
 */
async function confirmIdentity(userId: string, confirm: unknown): Promise<{ ok: true; email: string; hasPassword: boolean } | { ok: false; error: string }> {
  if (!(await consumeLimit("passwordUser", userId))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!u) return { ok: false, error: "사용자를 찾을 수 없습니다." };
  const value = typeof confirm === "string" ? confirm : "";
  if (u.passwordHash) {
    if (!value || !(await bcrypt.compare(value, u.passwordHash))) return { ok: false, error: "비밀번호가 올바르지 않습니다." };
  } else if (value.trim().toLowerCase() !== u.email.toLowerCase()) {
    return { ok: false, error: "확인용 이메일이 일치하지 않습니다." };
  }
  return { ok: true, email: u.email, hasPassword: !!u.passwordHash };
}

// ───────────────────────── 비밀번호 ─────────────────────────

/**
 * 비밀번호 변경. 바꾸면 다른 기기의 로그인은 모두 끊고(세션 세대 +1), 이 기기는 새 비밀번호로 다시 로그인시킨다.
 */
export async function changePassword(raw: unknown): Promise<ActionResult> {
  const { user } = await getViewer();
  const parsed = z.object({ current: z.string(), next: newPassword }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const hash = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!hash?.passwordHash) return { ok: false, error: "소셜 로그인으로 가입한 계정은 비밀번호가 없어요." };
  const who = await confirmIdentity(user.id, parsed.data.current);
  if (!who.ok) return who;
  if (parsed.data.current === parsed.data.next) return { ok: false, error: "지금과 다른 비밀번호를 입력하세요." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.next, 10),
      sessionVersion: { increment: 1 },
      passwordResetHash: null,
      passwordResetExp: null,
    },
  });
  await signIn("credentials", { email: who.email, password: parsed.data.next, redirectTo: "/settings/account?changed=1" });
  return { ok: true };
}

/**
 * 관리자가 재설정 링크 발급 (메일 발송 없이 관리자가 직접 전해 준다). 24시간·1회용, 새로 발급하면 이전 링크는 무효.
 * 반환하는 경로는 이때 한 번만 볼 수 있다 (DB 에는 해시만 남는다).
 */
export async function issuePasswordReset(id: unknown): Promise<ActionResult<{ path: string; expiresAt: string }>> {
  await requireAdmin();
  const parsed = z.string().min(1).max(64).safeParse(id);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const target = await prisma.user.findUnique({ where: { id: parsed.data }, select: { passwordHash: true, approvedAt: true } });
  if (!target) return { ok: false, error: "사용자를 찾을 수 없습니다." };
  if (!target.passwordHash) return { ok: false, error: "소셜 로그인으로 가입한 계정이라 비밀번호가 없어요." };
  if (!target.approvedAt) return { ok: false, error: "승인 대기 중인 계정이에요. 먼저 승인하세요." };
  const token = newResetToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.user.update({ where: { id: parsed.data }, data: { passwordResetHash: hashResetToken(token), passwordResetExp: expiresAt } });
  return { ok: true, data: { path: `/reset-password?token=${token}`, expiresAt: expiresAt.toISOString() } };
}

/** 재설정 링크로 새 비밀번호 정하기 (로그인 전). 성공하면 링크는 지우고 모든 기기 로그인을 끊는다 */
export async function resetPassword(raw: unknown): Promise<ActionResult> {
  const parsed = z.object({ token: z.string(), password: newPassword }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  if (!(await consumeLimit("resetIp", clientIp(await headers())))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  if (!isResetTokenShape(parsed.data.token)) return { ok: false, error: "링크가 올바르지 않거나 만료됐어요. 관리자에게 새 링크를 받아 주세요." };
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  // 만료 전·미사용 링크일 때만 한 번에 바꾼다 (같은 링크 두 번 사용 방지)
  const r = await prisma.user.updateMany({
    where: { passwordResetHash: hashResetToken(parsed.data.token), passwordResetExp: { gt: new Date() } },
    data: { passwordHash, passwordResetHash: null, passwordResetExp: null, sessionVersion: { increment: 1 } },
  });
  if (r.count !== 1) return { ok: false, error: "링크가 올바르지 않거나 만료됐어요. 관리자에게 새 링크를 받아 주세요." };
  redirect("/login?error=reset");
}

// ───────────────────────── 가구 나가기 · 탈퇴 ─────────────────────────

export interface LeaveImpact {
  privateAccounts: number;
  privateTx: number;
  ownAccounts: number;
  partnerName: string | null;
  hasPassword: boolean;
  isAdmin: boolean;
  /** 혼자 쓰는 가구 — 탈퇴하면 가구째 지워진다 */
  solo: boolean;
}

/** 나가기·탈퇴 전에 보여 줄 영향 */
export async function getLeaveImpact(): Promise<ActionResult<LeaveImpact>> {
  const { user, membership } = await getViewer();
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  const partner = membership?.household.members.find((m) => m.userId !== user.id) ?? null;
  const impact = membership && partner ? await detachImpact(prisma, user.id, membership.householdId) : { privateAccounts: 0, privateTx: 0, ownAccounts: 0 };
  return {
    ok: true,
    data: {
      ...impact,
      partnerName: partner?.user.name ?? null,
      hasPassword: !!u?.passwordHash,
      isAdmin: isAdminEmail(user.email),
      solo: !!membership && !partner,
    },
  };
}

/**
 * 부부 가구에서 나가기: 가구는 배우자에게 남고, 나는 새로 시작한다(온보딩).
 * 정리 규칙은 관리자 삭제와 같다 — 내 비공개 계좌·거래는 지워지고, 공개 계좌는 공동 명의로 남는다.
 */
export async function leaveHousehold(raw: unknown): Promise<ActionResult> {
  const { user, membership } = await getViewer();
  if (!membership) return { ok: false, error: "가구에 속해 있지 않아요." };
  const partner = membership.household.members.find((m) => m.userId !== user.id);
  if (!partner) return { ok: false, error: "혼자 쓰는 가구는 나갈 수 없어요. 그만 쓰려면 탈퇴하세요." };
  const who = await confirmIdentity(user.id, (raw as { confirm?: unknown } | null)?.confirm);
  if (!who.ok) return who;

  const householdId = membership.householdId;
  await prisma.$transaction(
    async (db) => {
      const partnerMember = await db.householdMember.findFirstOrThrow({ where: { householdId, userId: partner.userId, leftAt: null } });
      await detachMember(db, { userId: user.id, householdId, partnerUserId: partner.userId, partnerMemberId: partnerMember.id, wasOwner: membership.role === "OWNER" });
      await db.householdMember.update({ where: { id: membership.id }, data: { leftAt: new Date(), role: "MEMBER" } });
      await db.auditLog.create({ data: { householdId, userId: user.id, action: "MEMBER_LEAVE", entity: "HouseholdMember", entityId: user.id } });
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/**
 * 탈퇴 (되돌릴 수 없음). 혼자 쓰던 가구는 가구째, 부부 가구는 나만 빠지고 배우자에게 남는다.
 * 서비스 관리자(ADMIN_EMAILS)는 탈퇴할 수 없다 — 관리자가 사라지면 가입 승인을 할 사람이 없다.
 */
export async function deleteMyAccount(raw: unknown): Promise<ActionResult> {
  const { user } = await getViewer();
  if (isAdminEmail(user.email)) return { ok: false, error: "서비스 관리자 계정은 탈퇴할 수 없어요. ADMIN_EMAILS 에서 먼저 빼세요." };
  const who = await confirmIdentity(user.id, (raw as { confirm?: unknown } | null)?.confirm);
  if (!who.ok) return who;

  await prisma.$transaction(
    async (db) => {
      const r = await deleteUserAccount(db, user.id);
      if (r.kind === "member") {
        await db.auditLog.create({ data: { householdId: r.householdId, userId: user.id, action: "MEMBER_DELETE_SELF", entity: "User", entityId: user.id } });
      }
    },
    { timeout: 30_000 },
  );
  await signOut({ redirectTo: "/login?error=deleted" });
  return { ok: true };
}
