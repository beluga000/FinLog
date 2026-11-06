"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { keepGoalsSteady, linkedGoalsOf } from "@/features/goals/queries";
import type { RecurringTemplate } from "@/features/ledger/queries";
import { amountStr, type ActionResult } from "@/features/ledger/schema";
import { requireHousehold, writeAudit, type HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { isLiability } from "@/lib/finance/balance";
import { addDays, todayKST } from "@/lib/finance/period";
import { loanPlan } from "@/lib/finance/loan";
import { isSavingsProduct, SAVINGS_PRODUCTS } from "@/lib/finance/savings-products";
import { canSeeAccount } from "@/lib/finance/visibility";
import { normalizeBilling, normalizeLoan, normalizeSavings, OWNER_CHOICES, PAYMENT_SOURCE_TYPES, resolveOwner, visibilityError } from "./rules";

const ACCOUNT_TYPES = [
  "CASH", "CHECKING", "SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET", "CREDIT_CARD", "LOAN",
] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 확인하세요.");

const accountSchema = z.object({
  name: z.string().trim().min(1, "계좌 이름을 입력하세요.").max(40),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(40).nullable(),
  owner: z.enum(OWNER_CHOICES),
  defaultVisibility: z.enum(["SHARED", "SUMMARY_ONLY", "PRIVATE"]),
  /** 카드 결제일 · 대출 납입일 (CREDIT_CARD · LOAN) */
  billingDay: z.number().int().min(1, "결제일은 1~31일이에요.").max(31, "결제일은 1~31일이에요.").nullable().default(null),
  /** 카드 대금 · 대출 이자·상환금 출금 계좌 (CREDIT_CARD · LOAN) */
  paymentAccountId: z.string().nullable().default(null),
  /** 예적금 가입일 / 대출일 · 만기일 · 연 금리(%) (SAVINGS · LOAN) */
  openedOn: dateStr.nullable().default(null),
  maturityDate: dateStr.nullable().default(null),
  interestRatePct: z.number().min(0, "금리를 확인하세요.").max(30, "금리는 30% 이하로 입력하세요.").nullable().default(null),
  /** 정책형 적금 종류·기여금 구간 (SAVINGS 만) */
  savingsProduct: z.string().max(20).nullable().default(null),
  savingsTier: z.string().max(20).nullable().default(null),
  /** 대출 상환 방식 (LOAN 만) */
  loanRepayment: z.string().max(20).nullable().default(null),
  /** 전세·월세 보증금 대출 (LOAN 만) — 순자산에서 뺀다 */
  depositLoan: z.boolean().default(false),
});

/** 적금 계좌 추가와 함께 만드는 매달 자동이체 (SAVINGS 새 계좌만) */
const autoSaveSchema = z.object({
  amount: amountStr,
  /** 1~31, 0 = 말일 */
  dayOfMonth: z.number().int().min(0).max(31),
  fromAccountId: z.string().min(1, "출금 계좌를 고르세요."),
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
  if (paymentAccountId === cardId) return "자기 자신을 출금 계좌로 고를 수 없어요.";
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
  const savings = normalizeSavings(type, d);
  if (!savings.ok) return savings;
  const loan = normalizeLoan(type, d);
  if (!loan.ok) return loan;
  return {
    ok: true as const,
    ownerUserId: owner.ownerUserId,
    ...billing,
    openedOn: savings.openedOn ? toDbDate(savings.openedOn) : null,
    maturityDate: savings.maturityDate ? toDbDate(savings.maturityDate) : null,
    interestRate: savings.interestRate,
    savingsProduct: savings.savingsProduct,
    savingsTier: savings.savingsTier,
    loanRepayment: loan.loanRepayment,
    depositLoan: loan.depositLoan,
  };
}

export async function createAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireHousehold();
  const parsed = accountSchema
    .extend({
      openingBalance: balanceSchema.shape.balance,
      autoSave: autoSaveSchema.nullable().default(null),
      /** 만기일시상환 대출: 매달 이자 자동 기록 (LOAN 새 계좌만) */
      autoInterest: z.boolean().default(false),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const d = parsed.data;
  const r = await resolveInput(ctx, d, d.type);
  if (!r.ok) return r;

  // 월 납입액을 넣었으면 자동이체도 같이 — 시작 잔액에 지난 납입이 들어 있으니 내일(또는 가입일)부터 기록한다
  const autoSave = d.type === "SAVINGS" ? d.autoSave : null;
  let rulePlan: { fromVisibility: (typeof d)["defaultVisibility"]; startDate: string; endDate: string | null } | null = null;
  if (autoSave) {
    const fromErr = await checkPaymentAccount(ctx, autoSave.fromAccountId);
    if (fromErr) return { ok: false, error: fromErr };
    const product = r.savingsProduct && isSavingsProduct(r.savingsProduct) ? SAVINGS_PRODUCTS[r.savingsProduct] : null;
    if (product && BigInt(autoSave.amount) > BigInt(product.monthlyMax)) {
      return { ok: false, error: `${product.label}은 월 ${(product.monthlyMax / 10_000).toLocaleString("ko-KR")}만원까지 넣을 수 있어요.` };
    }
    const from = await prisma.account.findUniqueOrThrow({ where: { id: autoSave.fromAccountId }, select: { defaultVisibility: true } });
    const tomorrow = addDays(todayKST(), 1);
    const startDate = d.openedOn && d.openedOn > tomorrow ? d.openedOn : tomorrow;
    const endDate = d.maturityDate;
    if (endDate && endDate < startDate) return { ok: false, error: "만기일이 지나 자동이체를 만들 수 없어요. 월 납입액을 비워 주세요." };
    rulePlan = { fromVisibility: from.defaultVisibility, startDate, endDate };
  }

  // 만기일시상환은 원금이 그대로라 매달 이자도 같다 → 이자 자동이체(지출)를 같이 만들어 고정비로 잡는다.
  // 원리금·원금균등은 원금·이자 비율이 매달 바뀌어 고정 금액 자동이체로 맞출 수 없어 만들지 않는다.
  let interestRule: { amount: bigint; dayOfMonth: number; fromAccountId: string; categoryId: string | null; visibility: (typeof d)["defaultVisibility"]; startDate: string; endDate: string | null } | null = null;
  if (d.type === "LOAN" && d.autoInterest) {
    if (r.loanRepayment !== "BULLET") return { ok: false, error: "이자 자동 기록은 만기일시상환 대출만 할 수 있어요." };
    if (!r.paymentAccountId) return { ok: false, error: "이자 출금 계좌를 고르세요." };
    if (r.interestRate === null) return { ok: false, error: "금리를 넣어 주세요." };
    const today = todayKST();
    const plan = loanPlan(
      { balance: -toStoredBalance(d.type, d.openingBalance), annualRate: r.interestRate, repayment: "BULLET", payDay: r.billingDay, maturityDate: d.maturityDate },
      today,
    );
    if (!plan || plan.next.interest <= 0n) return { ok: false, error: "남은 원금과 만기일을 확인하세요." };
    const tomorrow = addDays(today, 1);
    const [from, category] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: r.paymentAccountId }, select: { defaultVisibility: true } }),
      prisma.category.findFirst({ where: { householdId: ctx.householdId, txType: "EXPENSE", name: "대출이자" }, select: { id: true } }),
    ]);
    interestRule = {
      amount: plan.next.interest,
      dayOfMonth: r.billingDay ?? Number((d.maturityDate ?? tomorrow).slice(8, 10)),
      fromAccountId: r.paymentAccountId,
      categoryId: category?.id ?? null,
      visibility: from.defaultVisibility,
      startDate: tomorrow,
      endDate: d.maturityDate,
    };
  }

  const account = await prisma.$transaction(async (db) => {
    const created = await db.account.create({
      data: {
        householdId: ctx.householdId,
        ownerUserId: r.ownerUserId,
        name: d.name,
        type: d.type,
        institution: d.institution || null,
        defaultVisibility: d.defaultVisibility,
        billingDay: r.billingDay,
        paymentAccountId: r.paymentAccountId,
        openedOn: r.openedOn,
        maturityDate: r.maturityDate,
        interestRate: r.interestRate,
        savingsProduct: r.savingsProduct,
        savingsTier: r.savingsTier,
        loanRepayment: r.loanRepayment,
        depositLoan: r.depositLoan,
        // 시작 잔액 = 어제 마감 잔액 → 오늘 입력하는 거래부터 반영된다
        snapshots: { create: { asOf: toDbDate(addDays(todayKST(), -1)), balance: toStoredBalance(d.type, d.openingBalance) } },
      },
    });
    if (autoSave && rulePlan) {
      const template: RecurringTemplate = {
        type: "SAVE_INVEST",
        amount: autoSave.amount,
        fromAccountId: autoSave.fromAccountId,
        toAccountId: created.id,
        categoryId: null,
        merchant: null,
        memo: null,
        // 정기 거래 폼과 같은 기준: 출금 계좌 기본 공개범위
        visibility: rulePlan.fromVisibility,
      };
      await db.recurringRule.create({
        data: {
          householdId: ctx.householdId,
          createdByUserId: ctx.userId,
          name: d.name,
          template: template as object,
          dayOfMonth: autoSave.dayOfMonth,
          businessDayAdjust: "NONE",
          startDate: toDbDate(rulePlan.startDate),
          endDate: rulePlan.endDate ? toDbDate(rulePlan.endDate) : null,
        },
      });
    }
    if (interestRule) {
      const template: RecurringTemplate = {
        type: "EXPENSE",
        amount: interestRule.amount.toString(),
        fromAccountId: interestRule.fromAccountId,
        toAccountId: null,
        categoryId: interestRule.categoryId,
        merchant: d.institution || d.name,
        memo: `${d.name} 이자`,
        visibility: interestRule.visibility,
      };
      await db.recurringRule.create({
        data: {
          householdId: ctx.householdId,
          createdByUserId: ctx.userId,
          name: `${d.name} 이자`,
          template: template as object,
          dayOfMonth: interestRule.dayOfMonth,
          businessDayAdjust: "NONE",
          startDate: toDbDate(interestRule.startDate),
          endDate: interestRule.endDate ? toDbDate(interestRule.endDate) : null,
        },
      });
    }
    return created;
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
      openedOn: r.openedOn,
      maturityDate: r.maturityDate,
      interestRate: r.interestRate,
      savingsProduct: r.savingsProduct,
      savingsTier: r.savingsTier,
      loanRepayment: r.loanRepayment,
      depositLoan: r.depositLoan,
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

/** 이 계좌로 들어가거나 나가는 진행 중 자동이체 (정기 거래 템플릿은 JSON 이라 가계 규칙을 읽어 거른다) */
async function activeRulesOf(householdId: string, accountId: string) {
  const rules = await prisma.recurringRule.findMany({ where: { householdId, isActive: true } });
  return rules.filter((r) => {
    const t = r.template as { fromAccountId?: string | null; toAccountId?: string | null };
    return t.fromAccountId === accountId || t.toAccountId === accountId;
  });
}

/** 보관 전 확인: 같이 멈출 자동이체 수 (내 것 / 배우자 것 — 배우자 규칙은 만든 사람만 바꿀 수 있다) */
export async function getArchiveImpact(
  id: string,
): Promise<ActionResult<{ mine: number; others: number; goals: { name: string; current: number }[] }>> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  const [rules, goals] = await Promise.all([activeRulesOf(ctx.householdId, id), linkedGoalsOf(ctx, id)]);
  const mine = rules.filter((r) => r.createdByUserId === ctx.userId).length;
  return { ok: true, data: { mine, others: rules.length - mine, goals: goals.map(({ name, current }) => ({ name, current })) } };
}

export async function setAccountArchived(
  id: string,
  isArchived: boolean,
  opts: { stopRecurring?: boolean } = {},
): Promise<ActionResult<{ stopped: number }>> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  // 해지한 계좌로 납입이 계속 기록되지 않게, 보관할 때 내가 만든 자동이체를 함께 멈출 수 있다 (다시 켜기 가능)
  const stopIds =
    isArchived && opts.stopRecurring
      ? (await activeRulesOf(ctx.householdId, id)).filter((r) => r.createdByUserId === ctx.userId).map((r) => r.id)
      : [];
  // 보관하면 잔액 계산에서 빠지고 복원하면 돌아온다 — 연결된 목표의 모인 돈은 그 직전 금액으로 유지
  await keepGoalsSteady(ctx, id, async () => {
    await prisma.$transaction([
      prisma.account.update({ where: { id }, data: { isArchived } }),
      prisma.recurringRule.updateMany({ where: { id: { in: stopIds } }, data: { isActive: false } }),
    ]);
  });
  await writeAudit(ctx, isArchived ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE", "Account", id, stopIds.length ? { stoppedRules: stopIds } : undefined);
  revalidatePath("/", "layout");
  return { ok: true, data: { stopped: stopIds.length } };
}

/** 계좌에 연결된 자동이체 전부 (진행·중지 모두) */
async function rulesOf(householdId: string, accountId: string) {
  const rules = await prisma.recurringRule.findMany({ where: { householdId } });
  return rules.filter((r) => {
    const t = r.template as { fromAccountId?: string | null; toAccountId?: string | null };
    return t.fromAccountId === accountId || t.toAccountId === accountId;
  });
}

/** 지워지지 않은 거래 중 이 계좌를 쓰는 건수 */
function liveTxCount(householdId: string, accountId: string) {
  return prisma.transaction.count({
    where: { householdId, deletedAt: null, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
  });
}

/** 삭제 전 확인: 거래가 남아 있거나 배우자 자동이체가 걸려 있으면 지울 수 없다 */
export async function getDeleteImpact(
  id: string,
): Promise<ActionResult<{ transactions: number; myRules: number; otherRules: number; goals: string[] }>> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  const [transactions, rules, goals] = await Promise.all([
    liveTxCount(ctx.householdId, id),
    rulesOf(ctx.householdId, id),
    prisma.assetGoal.findMany({ where: { householdId: ctx.householdId, linkedAccountIds: { has: id } }, select: { name: true } }),
  ]);
  const myRules = rules.filter((r) => r.createdByUserId === ctx.userId).length;
  return { ok: true, data: { transactions, myRules, otherRules: rules.length - myRules, goals: goals.map((g) => g.name) } };
}

/**
 * 보관한 계좌 삭제 — 거래가 하나도 없는 계좌만 (잘못 만든 계좌 정리용).
 * 거래가 있으면 과거 리포트가 바뀌므로 보관으로 둔다.
 * 함께 정리: 지운(휴지통) 거래 · 내가 만든 자동이체 · 목표의 연결 계좌. 잔액 기록은 DB 가 같이 지우고, 카드 출금 계좌는 비워진다.
 */
export async function deleteAccount(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  if (!account.isArchived) return { ok: false, error: "보관한 계좌만 삭제할 수 있어요." };
  const [transactions, rules] = await Promise.all([liveTxCount(ctx.householdId, id), rulesOf(ctx.householdId, id)]);
  if (transactions > 0) return { ok: false, error: `거래 ${transactions}건이 있어 삭제할 수 없어요. 보관해 두세요.` };
  if (rules.some((r) => r.createdByUserId !== ctx.userId)) {
    return { ok: false, error: "배우자가 만든 자동이체가 연결돼 있어요. 배우자가 먼저 그 자동이체를 삭제해야 해요." };
  }
  const goals = await prisma.assetGoal.findMany({ where: { householdId: ctx.householdId, linkedAccountIds: { has: id } } });
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { householdId: ctx.householdId, OR: [{ fromAccountId: id }, { toAccountId: id }] } }),
    prisma.recurringRule.deleteMany({ where: { id: { in: rules.map((r) => r.id) } } }),
    ...goals.map((g) =>
      prisma.assetGoal.update({ where: { id: g.id }, data: { linkedAccountIds: g.linkedAccountIds.filter((x) => x !== id) } }),
    ),
    prisma.account.delete({ where: { id } }),
  ]);
  await writeAudit(ctx, "ACCOUNT_DELETE", "Account", id, { name: account.name, type: account.type, rules: rules.length });
  revalidatePath("/", "layout");
  return { ok: true };
}

const visibilityChangeSchema = z.object({
  visibility: z.enum(["SHARED", "SUMMARY_ONLY", "PRIVATE"]),
  /** 이 계좌로 내가 기록한 지난 거래·정기 거래 중 이전 기본값 그대로인 것도 바꾼다 */
  applyToExisting: z.boolean().default(false),
});

/**
 * 거래 공개범위의 기본값 계좌 = 출금 계좌, 없으면 입금 계좌 (defaultVisibilityFor 와 같은 기준).
 * 그 기준으로 이 계좌를 따르는 "내" 기록만 바꾼다 — 배우자가 기록한 거래는 그 사람만 바꿀 수 있다.
 * 이전 기본값과 다르게 따로 정한 기록(예: 공유 계좌의 비공개 거래)은 그대로 둔다 — 숨겨 둔 거래가 일괄 변경으로 드러나지 않게.
 */
function followsAccount(id: string) {
  return { OR: [{ fromAccountId: id }, { fromAccountId: null, toAccountId: id }] };
}

/** 부부 설정: 계좌 기본 공개범위 변경 (+ 지난 기록 일괄 변경) */
export async function setAccountVisibility(id: string, raw: unknown): Promise<ActionResult<{ updated: number }>> {
  const ctx = await requireHousehold();
  const account = await findManageable(ctx, id);
  if (!account) return { ok: false, error: NOT_FOUND };
  const parsed = visibilityChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const { visibility, applyToExisting } = parsed.data;
  const visErr = visibilityError(account.ownerUserId, ctx.userId, visibility);
  if (visErr) return { ok: false, error: visErr };

  const previous = account.defaultVisibility;
  let updated = 0;
  await prisma.$transaction(async (db) => {
    await db.account.update({ where: { id }, data: { defaultVisibility: visibility } });
    if (!applyToExisting) return;
    const txs = await db.transaction.updateMany({
      where: { householdId: ctx.householdId, createdByUserId: ctx.userId, deletedAt: null, visibility: previous, ...followsAccount(id) },
      data: { visibility },
    });
    updated = txs.count;
    // 정기 거래 템플릿도 같이 — 다음 회차부터 바뀐 공개범위로 생성된다
    const rules = await db.recurringRule.findMany({ where: { householdId: ctx.householdId, createdByUserId: ctx.userId } });
    for (const r of rules) {
      const t = r.template as { fromAccountId: string | null; toAccountId: string | null; visibility: string };
      const follows = t.fromAccountId === id || (t.fromAccountId === null && t.toAccountId === id);
      if (!follows || t.visibility !== previous) continue;
      await db.recurringRule.update({ where: { id: r.id }, data: { template: { ...t, visibility } } });
    }
  });
  await writeAudit(ctx, "ACCOUNT_VISIBILITY", "Account", id, { visibility, applyToExisting, updated });
  revalidatePath("/", "layout");
  return { ok: true, data: { updated } };
}
