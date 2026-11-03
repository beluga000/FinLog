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

/** 카드 결제 정보 정리: 카드가 아니면 비운다 */
export function normalizeBilling(
  type: AccountType,
  input: { billingDay: number | null; paymentAccountId: string | null },
): { billingDay: number | null; paymentAccountId: string | null } {
  if (type !== "CREDIT_CARD") return { billingDay: null, paymentAccountId: null };
  return { billingDay: input.billingDay, paymentAccountId: input.paymentAccountId || null };
}
