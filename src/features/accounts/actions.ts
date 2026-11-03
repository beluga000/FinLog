"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/features/ledger/schema";
import { requireHousehold, writeAudit, type HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { isLiability } from "@/lib/finance/balance";
import { addDays, todayKST } from "@/lib/finance/period";
import { canSeeAccount } from "@/lib/finance/visibility";
import { normalizeBilling, OWNER_CHOICES, PAYMENT_SOURCE_TYPES, resolveOwner, visibilityError } from "./rules";

const ACCOUNT_TYPES = [
  "CASH", "CHECKING", "SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET", "CREDIT_CARD", "LOAN",
] as const;

const accountSchema = z.object({
  name: z.string().trim().min(1, "계좌 이름을 입력하세요.").max(40),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(40).nullable(),
  owner: z.enum(OWNER_CHOICES),
  defaultVisibility: z.enum(["SHARED", "SUMMARY_ONLY", "PRIVATE"]),
  /** 카드 결제일 (CREDIT_CARD 만) */
  billingDay: z.number().int().min(1, "결제일은 1~31일이에요.").max(31, "결제일은 1~31일이에요.").nullable().default(null),
  /** 카드 대금 출금 계좌 (CREDIT_CARD 만) */
  paymentAccountId: z.string().nullable().default(null),
});

const balanceSchema = z.object({
  /** 표시 금액(부채는 갚아야 할 금액을 양수로 입력) */
  balance: z.string().regex(/^-?\d+$/, "금액은 숫자만 입력하세요."),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Ctx = Pick<HouseholdContext, "householdId" | "userId"> & { partner: { id: string } | null };

/** 부채 계좌는 사용자가 양수(빚)로 입력 → 저장은 음수 */
function toStoredBalance(type: (typeof ACCOUNT_TYPES)[number], input: string): bigint {
  const v = BigInt(input);
  return isLiability(type) ? -(v < 0n ? -v : v) : v;
}

/** 출금 계좌: 같은 가계·사용 중·통장/현금·내가 볼 수 있는 계좌 */
async function checkPaymentAccount(ctx: Ctx, paymentAccountId: string | null, cardId?: string): Promise<string | null> {
  if (!paymentAccountId) return null;
  if (paymentAccountId === cardId) return "카드 자신을 출금 계좌로 고를 수 없어요.";
  const src = await prisma.account.findFirst({ where: { id: paymentAccountId, householdId: ctx.householdId, isArchived: false } });
  if (!src || !canSeeAccount(src, ctx.userId, "us")) return "출금 계좌를 찾을 수 없어요.";
  if (!PAYMENT_SOURCE_TYPES.includes(src.type)) return "출금 계좌는 입출금·저축 통장이나 현금만 고를 수 있어요.";
  return null;
}

/** 공통 검증: 명의 → id, 공개범위, 카드 결제 정보 */
async function resolveInput(ctx: Ctx, d: z.infer<typeof accountSchema>, type: (typeof ACCOUNT_TYPES)[number], cardId?: string) {
  const owner = resolveOwner(d.owner, { userId: ctx.userId, partnerId: ctx.partner?.id ?? null });
  if (!owner.ok) return owner;
  const visErr = visibilityError(owner.ownerUserId, ctx.userId, d.defaultVisibility);
  if (visErr) return { ok: false as const, error: visErr };
  const billing = normalizeBilling(type, d);
  const payErr = await checkPaymentAccount(ctx, billing.paymentAccountId, cardId);
  if (payErr) return { ok: false as const, error: payErr };
  return { ok: true as const, ownerUserId: owner.ownerUserId, ...billing };
}

export async function createAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireHousehold();
  const parsed = accountSchema.extend({ openingBalance: balanceSchema.shape.balance }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  const r = await resolveInput(ctx, d, d.type);
  if (!r.ok) return r;
  const account = await prisma.account.create({
    data: {
      householdId: ctx.householdId,
      ownerUserId: r.ownerUserId,
      name: d.name,
      type: d.type,
      institution: d.institution || null,
      defaultVisibility: d.defaultVisibility,
      billingDay: r.billingDay,
      paymentAccountId: r.paymentAccountId,
      // 시작 잔액 = 어제 마감 잔액 → 오늘 입력하는 거래부터 반영된다
      snapshots: { create: { asOf: toDbDate(addDays(todayKST(), -1)), balance: toStoredBalance(d.type, d.openingBalance) } },
    },
  });
  if (r.ownerUserId !== ctx.userId) await writeAudit(ctx, "ACCOUNT_CREATE_FOR_OTHER", "Account", account.id);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: account.id } };
}

/**
 * 관리 가능 = 내가 볼 수 있는 계좌 (내 것·공동·배우자 공개 계좌).
 * 배우자의 비공개 계좌는 존재 자체가 보이지 않으므로 자연히 제외된다.
 */
async function findManageable(ctx: Ctx, id: string) {
  const account = await prisma.account.findFirst({ where: { id, householdId: ctx.householdId } });
  if (!account || !canSeeAccount(account, ctx.userId, "us")) return null;
  return account;
}

const NOT_FOUND = "계좌를 찾을 수 없어요.";

export async function updateAccount(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  const parsed = accountSchema.omit({ type: true }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  // 비공개 전환은 원래 내 명의였던 계좌만 — 공동·배우자 계좌를 내 명의로 바꿔 숨기는 것 방지
  if (d.defaultVisibility === "PRIVATE" && account.defaultVisibility !== "PRIVATE" && account.ownerUserId !== ctx.userId) {
    return { ok: false, error: "비공개는 원래 내 명의인 계좌만 설정할 수 있어요." };
  }
  const r = await resolveInput(ctx, { ...d, type: account.type }, account.type, id);
  if (!r.ok) return r;
  await prisma.account.update({
    where: { id },
    data: {
      name: d.name,
      institution: d.institution || null,
      ownerUserId: r.ownerUserId,
      defaultVisibility: d.defaultVisibility,
      billingDay: r.billingDay,
      paymentAccountId: r.paymentAccountId,
    },
  });
  if (account.ownerUserId !== ctx.userId || r.ownerUserId !== account.ownerUserId) {
    await writeAudit(ctx, "ACCOUNT_UPDATE", "Account", id);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 실제 잔액 입력 → 스냅샷 (같은 날짜면 덮어씀). 이후 잔액은 스냅샷 + 거래 흐름. */
export async function recordBalance(id: string, raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
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
  if (!account) return { ok: false, error: NOT_FOUND };
  await prisma.account.update({ where: { id }, data: { isArchived } });
  await writeAudit(ctx, isArchived ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE", "Account", id);
  revalidatePath("/", "layout");
  return { ok: true };
}
