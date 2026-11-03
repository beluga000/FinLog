"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { isAdminEmail } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "./access";

const idSchema = z.string().min(1).max(64);

function done() {
  revalidatePath("/admin");
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
