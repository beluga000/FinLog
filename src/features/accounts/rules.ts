import { isLoanRepayment, type LoanRepayment } from "@/lib/finance/loan";
import { isSavingsProduct, SAVINGS_PRODUCTS } from "@/lib/finance/savings-products";
import type { AccountType, Visibility } from "@/lib/finance/types";

/**
 * 계좌 명의 (부부 가계).
 * - me: 내 명의 / partner: 배우자 명의 (대신 등록) / joint: 공동
 * 부부는 서로의 계좌를 등록·수정할 수 있다. 단 비공개(PRIVATE)는 명의자 본인만 정할 수 있다
 * — 배우자 계좌를 비공개로 만들면 등록한 사람에게서 사라지고, 남의 계좌를 숨기는 것도 막는다.
 */
export type OwnerChoice = "me" | "partner" | "joint";

export const OWNER_CHOICES = ["me", "partner", "joint"] as const;

/** 대금을 낼 수 있는 계좌 종류 */
export const PAYMENT_SOURCE_TYPES: AccountType[] = ["CHECKING", "SAVINGS", "CASH"];

/** 새 자동이체의 출금 계좌 기본값: 내 명의 입출금 → 공동 입출금 → 아무 입출금 통장 */
export function defaultSourceAccount<T extends { type: AccountType; ownerUserId: string | null }>(accounts: T[], viewerId: string): T | null {
  return (
    accounts.find((a) => a.type === "CHECKING" && a.ownerUserId === viewerId) ??
    accounts.find((a) => a.type === "CHECKING" && a.ownerUserId === null) ??
    accounts.find((a) => a.type === "CHECKING") ??
    null
  );
}

export function ownerChoiceOf(ownerUserId: string | null, viewerId: string): OwnerChoice {
  if (ownerUserId === null) return "joint";
  return ownerUserId === viewerId ? "me" : "partner";
}

export function resolveOwner(
  choice: OwnerChoice,
  ctx: { userId: string; partnerId: string | null },
): { ok: true; ownerUserId: string | null } | { ok: false; error: string } {
  if (choice === "me") return { ok: true, ownerUserId: ctx.userId };
  if (choice === "joint") return { ok: true, ownerUserId: null };
  if (!ctx.partnerId) return { ok: false, error: "배우자가 가계에 참여한 뒤에 배우자 명의로 등록할 수 있어요." };
  return { ok: true, ownerUserId: ctx.partnerId };
}

export function visibilityError(ownerUserId: string | null, viewerId: string, visibility: Visibility): string | null {
  if (visibility !== "PRIVATE") return null;
  if (ownerUserId === null) return "공동 명의 계좌는 비공개로 설정할 수 없습니다.";
  if (ownerUserId !== viewerId) return "비공개는 명의자 본인만 설정할 수 있어요.";
  return null;
}

/** 결제일·출금 계좌를 쓰는 계좌: 카드(결제일·대금 출금) · 대출(납입일·이자·상환금 출금) */
export const BILLING_TYPES: AccountType[] = ["CREDIT_CARD", "LOAN"];

/** 결제(납입) 정보 정리: 카드·대출이 아니면 비운다 */
export function normalizeBilling(
  type: AccountType,
  input: { billingDay: number | null; paymentAccountId: string | null },
): { billingDay: number | null; paymentAccountId: string | null } {
  if (!BILLING_TYPES.includes(type)) return { billingDay: null, paymentAccountId: null };
  return { billingDay: input.billingDay, paymentAccountId: input.paymentAccountId || null };
}

export interface SavingsProductInput {
  openedOn: string | null;
  maturityDate: string | null;
  /** 연 금리 % (3.5 = 3.5%) */
  interestRatePct: number | null;
  /** 정책형 적금 종류·기여금 구간 (일반 상품은 null) */
  savingsProduct?: string | null;
  savingsTier?: string | null;
}

/** 예적금 상품 정보 정리: 저축 통장이 아니면 비운다. 금리는 % → 비율 */
export function normalizeSavings(
  type: AccountType,
  input: SavingsProductInput,
):
  | {
      ok: true;
      openedOn: string | null;
      maturityDate: string | null;
      interestRate: number | null;
      savingsProduct: string | null;
      savingsTier: string | null;
    }
  | { ok: false; error: string } {
  if (type !== "SAVINGS" && type !== "LOAN") {
    return { ok: true, openedOn: null, maturityDate: null, interestRate: null, savingsProduct: null, savingsTier: null };
  }
  const openedOn = input.openedOn || null;
  const maturityDate = input.maturityDate || null;
  const startLabel = type === "LOAN" ? "대출일" : "가입일";
  if (openedOn && maturityDate && maturityDate <= openedOn) return { ok: false, error: `만기일은 ${startLabel}보다 뒤여야 해요.` };
  const interestRate = input.interestRatePct === null ? null : Math.round(input.interestRatePct * 10_000) / 1_000_000;
  // 대출은 기간·금리만 — 정책형 적금 정보는 쓰지 않는다
  if (type === "LOAN") return { ok: true, openedOn, maturityDate, interestRate, savingsProduct: null, savingsTier: null };
  const raw = input.savingsProduct || null;
  if (raw && !isSavingsProduct(raw)) return { ok: false, error: "상품 종류를 확인하세요." };
  const product = raw && isSavingsProduct(raw) ? raw : null;
  const tier = product ? input.savingsTier || null : null;
  if (product && tier && !SAVINGS_PRODUCTS[product].tiers.some((t) => t.key === tier)) return { ok: false, error: "기여금 구간을 확인하세요." };
  return { ok: true, openedOn, maturityDate, interestRate, savingsProduct: product, savingsTier: tier };
}

/** 대출 상환 방식·보증금 대출 여부 정리: 대출이 아니면 비운다 */
export function normalizeLoan(
  type: AccountType,
  input: { loanRepayment: string | null; depositLoan: boolean },
): { ok: true; loanRepayment: LoanRepayment | null; depositLoan: boolean } | { ok: false; error: string } {
  if (type !== "LOAN") return { ok: true, loanRepayment: null, depositLoan: false };
  const raw = input.loanRepayment || null;
  if (raw && !isLoanRepayment(raw)) return { ok: false, error: "상환 방식을 확인하세요." };
  return { ok: true, loanRepayment: raw && isLoanRepayment(raw) ? raw : null, depositLoan: input.depositLoan };
}
