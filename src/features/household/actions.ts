"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { signIn, signOut } from "@/lib/auth";
import { getViewer, requireHousehold, writeAudit } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { lastDayOfMonth, parseMonthKey, toDateStr, todayKST } from "@/lib/finance/period";
import { createOnboardedHousehold } from "./setup";
import { moveHouseholdData, type JoinDataMode } from "./merge";
import { onboardingSchema } from "./onboarding-schema";

const MAX_MEMBERS = 2;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

// ───────────────────────── 인증 ─────────────────────────

const signupSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(20),
  email: z.email("이메일 형식이 올바르지 않습니다.").transform((v) => v.toLowerCase()),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
});

export async function signup(raw: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const { name, email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: "이미 가입된 이메일입니다." };
  await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10) } });
  await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  return { ok: true };
}

export async function login(raw: unknown): Promise<ActionResult> {
  const parsed = z.object({ email: z.string(), password: z.string(), callbackUrl: z.string().optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력값을 확인하세요." };
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeCallback(parsed.data.callbackUrl),
    });
  } catch (e) {
    // redirect 는 NEXT_REDIRECT 예외로 전달되므로 다시 던진다
    if (e instanceof Error && e.name === "CredentialsSignin") {
      return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    if (e && typeof e === "object" && "type" in e && (e as { type: string }).type === "CredentialsSignin") {
      return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    throw e;
  }
  return { ok: true };
}

function safeCallback(url: string | undefined): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

export async function socialLogin(provider: string) {
  await signIn(provider, { redirectTo: "/dashboard" });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

// ───────────────────────── 온보딩 ─────────────────────────

/**
 * 온보딩 완료 (PROD.MD §1-7): 가구·계좌·잔액 스냅샷·정기 규칙·첫 목표를 DB 트랜잭션 하나로 만든다.
 * 5단계 "홈으로" 전에는 아무것도 저장하지 않는다 (AC-11).
 */
export async function completeOnboarding(raw: unknown): Promise<ActionResult> {
  const { user, membership } = await getViewer();
  if (membership) return { ok: false, error: "이미 가구에 소속되어 있습니다." };
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;

  const today = todayKST();
  const { y, m } = parseMonthKey(d.goal.targetMonth);
  const targetDate = toDateStr(y, m, lastDayOfMonth(y, m));
  if (targetDate <= today) return { ok: false, error: "목표 시점은 이번 달 이후여야 합니다." };

  await prisma.$transaction(
    async (db) => {
      const householdId = await createOnboardedHousehold(db, { userId: user.id, input: d, today, targetDate });
      await db.auditLog.create({
        data: { householdId, userId: user.id, action: "ONBOARDING_COMPLETE", entity: "Household", entityId: householdId, diff: { template: d.goal.template } },
      });
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ───────────────────────── 초대 ─────────────────────────

export async function createInvite(): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const ctx = await requireHousehold();
  if (ctx.role !== "OWNER") return { ok: false, error: "가구 관리자만 초대할 수 있습니다." };
  if (ctx.members.length >= MAX_MEMBERS) return { ok: false, error: "이미 2명이 연결되어 있습니다." };

  // 기존 미사용 초대 무효화 후 새 코드 발급
  await prisma.householdInvite.updateMany({
    where: { householdId: ctx.householdId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const taken = await prisma.householdInvite.findUnique({ where: { code } });
    if (taken) {
      if (taken.usedAt || taken.expiresAt < new Date()) await prisma.householdInvite.delete({ where: { code } });
      else continue;
    }
    const invite = await prisma.householdInvite.create({
      data: { householdId: ctx.householdId, code, createdByUserId: ctx.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    await writeAudit(ctx, "INVITE_CREATE", "HouseholdInvite", invite.id);
    revalidatePath("/settings");
    return { ok: true, data: { code, expiresAt: invite.expiresAt.toISOString() } };
  }
  return { ok: false, error: "초대 코드를 만들지 못했습니다. 다시 시도하세요." };
}

const joinSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "6자리 숫자 코드를 입력하세요."),
  /** keep: 공유로 가져오기 / private: 비공개로 가져오기 / fresh: 가져오지 않음 */
  dataMode: z.enum(["keep", "private", "fresh"]),
});

export async function joinHousehold(raw: unknown): Promise<ActionResult> {
  const { user, membership } = await getViewer();
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };

  const invite = await prisma.householdInvite.findUnique({
    where: { code: parsed.data.code },
    include: { household: { include: { members: { where: { leftAt: null } } } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { ok: false, error: "유효하지 않거나 만료된 초대 코드입니다." };
  }
  if (invite.household.members.some((m) => m.userId === user.id)) return { ok: false, error: "이미 이 가구의 구성원입니다." };
  if (invite.household.members.length >= MAX_MEMBERS) return { ok: false, error: "이 가구는 이미 2명이 연결되어 있습니다." };

  if (membership) {
    const othersInCurrent = membership.household.members.filter((m) => m.userId !== user.id).length;
    if (othersInCurrent > 0) return { ok: false, error: "현재 다른 구성원과 연결된 가구에 있습니다. 먼저 현재 가구에서 나와야 합니다." };
  }

  const targetId = invite.householdId;
  const mode = parsed.data.dataMode;

  await prisma.$transaction(
    async (db) => {
      // 동시 사용 방지: 미사용 상태일 때만 사용 처리
      const used = await db.householdInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedByUserId: user.id },
      });
      if (used.count !== 1) throw new Error("INVITE_RACE");

      if (membership) {
        const fromId = membership.householdId;
        if (parsed.data.dataMode === "fresh") {
          await db.householdMember.update({ where: { id: membership.id }, data: { leftAt: new Date() } });
        } else {
          await moveHouseholdData(db, { fromHouseholdId: fromId, toHouseholdId: targetId, userId: user.id, mode: mode as JoinDataMode });
          await db.household.delete({ where: { id: fromId } });
        }
      }
      await db.householdMember.create({ data: { householdId: targetId, userId: user.id, role: "MEMBER" } });
      await db.auditLog.create({
        data: { householdId: targetId, userId: user.id, action: "MEMBER_JOIN", entity: "HouseholdMember", entityId: user.id, diff: { mode } },
      });
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ───────────────────────── 설정 ─────────────────────────

const settingsSchema = z.object({
  name: z.string().trim().min(1, "가구 이름을 입력하세요.").max(30),
  monthStartDay: z.number().int().min(1).max(28),
  emergencyMonths: z.number().int().min(1).max(24),
});

export async function updateHouseholdSettings(raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (ctx.role !== "OWNER") return { ok: false, error: "가구 관리자만 변경할 수 있습니다." };
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  await prisma.household.update({ where: { id: ctx.householdId }, data: parsed.data });
  await writeAudit(ctx, "HOUSEHOLD_SETTINGS", "Household", ctx.householdId, { before: ctx.household, after: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(20),
  parentId: z.string().min(1),
});

/** 소분류 추가 (대분류의 유형·버킷 상속) */
export async function addCategory(raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const parent = await prisma.category.findFirst({ where: { id: parsed.data.parentId, householdId: ctx.householdId, parentId: null } });
  if (!parent) return { ok: false, error: "대분류를 찾을 수 없습니다." };
  await prisma.category.create({
    data: { householdId: ctx.householdId, parentId: parent.id, name: parsed.data.name, txType: parent.txType, sortOrder: 99 },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function setCategoryBucket(id: string, bucket: "NEEDS" | "WANTS" | null): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const cat = await prisma.category.findFirst({ where: { id, householdId: ctx.householdId, txType: "EXPENSE" } });
  if (!cat) return { ok: false, error: "카테고리를 찾을 수 없습니다." };
  if (!cat.parentId && !bucket) return { ok: false, error: "대분류는 필수/선택 중 하나여야 합니다." };
  await prisma.category.update({ where: { id }, data: { bucket } });
  revalidatePath("/", "layout");
  return { ok: true };
}
