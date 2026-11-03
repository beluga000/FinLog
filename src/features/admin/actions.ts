"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { isAdminEmail } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "./access";
import { deleteUserAccount } from "./delete-user";

const idSchema = z.string().min(1).max(64);

function done() {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout"); // 헤더 대기 건수
}

export async function approveUser(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const r = await prisma.user.updateMany({ where: { id: parsed.data, approvedAt: null }, data: { approvedAt: new Date() } });
  if (r.count !== 1) return { ok: false, error: "이미 처리된 가입입니다." };
  done();
  return { ok: true };
}

/** 거절 = 승인 대기 계정 삭제. 승인 전에는 가구에 속할 수 없으므로 지워도 남는 데이터가 없다 */
export async function rejectUser(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const r = await prisma.user.deleteMany({ where: { id: parsed.data, approvedAt: null, memberships: { none: {} } } });
  if (r.count !== 1) return { ok: false, error: "이미 처리됐거나 삭제할 수 없는 계정입니다." };
  done();
  return { ok: true };
}

/** 승인 취소: 다시 승인 대기로. 데이터는 남기고, 다음 요청부터 접속이 막힌다 */
export async function revokeUser(id: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  if (parsed.data === admin.id) return { ok: false, error: "본인의 승인은 취소할 수 없습니다." };
  const target = await prisma.user.findUnique({ where: { id: parsed.data }, select: { email: true } });
  if (!target) return { ok: false, error: "사용자를 찾을 수 없습니다." };
  if (isAdminEmail(target.email)) return { ok: false, error: "관리자의 승인은 취소할 수 없습니다." };
  await prisma.user.update({ where: { id: parsed.data }, data: { approvedAt: null } });
  done();
  return { ok: true };
}

/** 강제 로그아웃: 세션 세대를 올려 그 사람의 모든 기기 로그인을 끊는다 (계정·데이터는 그대로) */
export async function forceLogoutUser(id: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  if (parsed.data === admin.id) return { ok: false, error: "본인은 프로필 메뉴의 '모든 기기에서 로그아웃'을 쓰세요." };
  const r = await prisma.user.updateMany({ where: { id: parsed.data }, data: { sessionVersion: { increment: 1 } } });
  if (r.count !== 1) return { ok: false, error: "사용자를 찾을 수 없습니다." };
  done();
  return { ok: true };
}

const deleteSchema = z.object({ id: idSchema, confirmEmail: z.string().trim().toLowerCase() });

/**
 * 계정 삭제 (되돌릴 수 없음). 확인용으로 그 사람의 이메일을 직접 입력해야 한다.
 * 혼자 쓰던 가구는 가구째, 부부 가구는 이 사람만 빼고 정리한다 (deleteUserAccount).
 */
export async function deleteUser(raw: unknown): Promise<ActionResult<{ kind: "user" | "household" | "member" }>> {
  const admin = await requireAdmin();
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const { id, confirmEmail } = parsed.data;
  if (id === admin.id) return { ok: false, error: "본인 계정은 삭제할 수 없습니다." };
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return { ok: false, error: "사용자를 찾을 수 없습니다." };
  if (isAdminEmail(target.email)) return { ok: false, error: "관리자 계정은 삭제할 수 없습니다. ADMIN_EMAILS 에서 먼저 빼세요." };
  if (target.email.toLowerCase() !== confirmEmail) return { ok: false, error: "확인용 이메일이 일치하지 않습니다." };

  const outcome = await prisma.$transaction(
    async (db) => {
      const r = await deleteUserAccount(db, id);
      // 남는 가구에 기록 (혼자 쓰던 가구는 감사 로그도 함께 사라진다)
      if (r.kind === "member") {
        await db.auditLog.create({
          data: { householdId: r.householdId, userId: admin.id, action: "ADMIN_USER_DELETE", entity: "User", entityId: id },
        });
      }
      return r;
    },
    { timeout: 30_000 },
  );
  done();
  return { ok: true, data: { kind: outcome.kind } };
}

const transferSchema = z.object({ householdId: idSchema, userId: idSchema });

/** 가구 관리자 넘기기: 지정한 구성원을 OWNER, 나머지는 MEMBER */
export async function transferHouseholdOwner(raw: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const { householdId, userId } = parsed.data;
  const members = await prisma.householdMember.findMany({ where: { householdId, leftAt: null } });
  const next = members.find((m) => m.userId === userId);
  if (!next) return { ok: false, error: "이 가구의 구성원이 아닙니다." };
  if (next.role === "OWNER") return { ok: false, error: "이미 가구 관리자입니다." };
  await prisma.$transaction([
    prisma.householdMember.updateMany({ where: { householdId, leftAt: null, id: { not: next.id } }, data: { role: "MEMBER" } }),
    prisma.householdMember.update({ where: { id: next.id }, data: { role: "OWNER" } }),
    prisma.auditLog.create({
      data: { householdId, userId: admin.id, action: "ADMIN_OWNER_TRANSFER", entity: "HouseholdMember", entityId: next.id },
    }),
  ]);
  done();
  return { ok: true };
}
