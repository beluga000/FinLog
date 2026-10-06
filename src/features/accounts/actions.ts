"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { requireHousehold, writeAudit } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { isLiability } from "@/lib/finance/balance";
import { addDays, todayKST } from "@/lib/finance/period";
import { canSeeAccount } from "@/lib/finance/visibility";

const ACCOUNT_TYPES = [
  "CASH", "CHECKING", "SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET", "CREDIT_CARD", "LOAN",
] as const;

const accountSchema = z.object({
  name: z.string().trim().min(1, "계좌 이름을 입력하세요.").max(40),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(40).nullable(),
  owner: z.enum(["me", "joint"]),
  defaultVisibility: z.enum(["SHARED", "SUMMARY_ONLY", "PRIVATE"]),
});

const balanceSchema = z.object({
  /** 표시 금액(부채는 갚아야 할 금액을 양수로 입력) */
  balance: z.string().regex(/^-?\d+$/, "금액은 숫자만 입력하세요."),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** 부채 계좌는 사용자가 양수(빚)로 입력 → 저장은 음수 */
function toStoredBalance(type: (typeof ACCOUNT_TYPES)[number], input: string): bigint {
  const v = BigInt(input);
  return isLiability(type) ? -(v < 0n ? -v : v) : v;
}

export async function createAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireHousehold();
  const parsed = accountSchema.extend({ openingBalance: balanceSchema.shape.balance }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  if (d.owner === "joint" && d.defaultVisibility === "PRIVATE") {
    return { ok: false, error: "공동 명의 계좌는 비공개로 설정할 수 없습니다." };
  }
  const account = await prisma.account.create({
    data: {
      householdId: ctx.householdId,
      ownerUserId: d.owner === "me" ? ctx.userId : null,
      name: d.name,
      type: d.type,
      institution: d.institution || null,
      defaultVisibility: d.defaultVisibility,
      // 시작 잔액 = 어제 마감 잔액 → 오늘 입력하는 거래부터 반영된다
      snapshots: { create: { asOf: toDbDate(addDays(todayKST(), -1)), balance: toStoredBalance(d.type, d.openingBalance) } },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { id: account.id } };
}

async function findManageable(ctx: { householdId: string; userId: string }, id: string) {
  const account = await prisma.account.findFirst({ where: { id, householdId: ctx.householdId } });
  if (!account || !canSeeAccount(account, ctx.userId, "us")) return null;
  // 배우자 명의 계좌는 배우자만 관리
  if (account.ownerUserId && account.ownerUserId !== ctx.userId) return null;
  return account;
}

export async function updateAccount(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: "본인 또는 공동 명의 계좌만 수정할 수 있습니다." };
  const parsed = accountSchema.omit({ type: true }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  if (d.owner === "joint" && d.defaultVisibility === "PRIVATE") {
    return { ok: false, error: "공동 명의 계좌는 비공개로 설정할 수 없습니다." };
  }
  await prisma.account.update({
    where: { id },
    data: {
      name: d.name,
      institution: d.institution || null,
      ownerUserId: d.owner === "me" ? ctx.userId : null,
      defaultVisibility: d.defaultVisibility,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 실제 잔액 입력 → 스냅샷 (같은 날짜면 덮어씀). 이후 잔액은 스냅샷 + 거래 흐름. */
export async function recordBalance(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: "본인 또는 공동 명의 계좌만 수정할 수 있습니다." };
  const parsed = balanceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  if (parsed.data.asOf > todayKST()) return { ok: false, error: "미래 날짜의 잔액은 입력할 수 없습니다." };
  const balance = toStoredBalance(account.type, parsed.data.balance);
  const asOf = toDbDate(parsed.data.asOf);
  await prisma.accountSnapshot.upsert({
    where: { accountId_asOf: { accountId: id, asOf } },
    create: { accountId: id, asOf, balance },
    update: { balance },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAccountArchived(id: string, isArchived: boolean): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: "본인 또는 공동 명의 계좌만 수정할 수 있습니다." };
  await prisma.account.update({ where: { id }, data: { isArchived } });
  await writeAudit(ctx, isArchived ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE", "Account", id);
  revalidatePath("/", "layout");
  return { ok: true };
}
