import { LIABILITY_TYPES, SAVING_DESTINATION_TYPES } from "./balance";
import type { AccountType, TxType } from "./types";

/**
 * 거래 유형별 계좌·카테고리 규칙 (PROD.MD §2-2).
 * 폼(클라이언트)과 서버 액션이 같은 규칙을 쓴다.
 */

export interface TxShape {
  type: TxType;
  fromAccountType: AccountType | null;
  toAccountType: AccountType | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
}

export const TX_TYPE_META: Record<
  TxType,
  { label: string; from: boolean; to: boolean; category: boolean; hint: string }
> = {
  EXPENSE: { label: "지출", from: true, to: false, category: true, hint: "카드로 쓴 돈은 카드 계좌에서 지출로 기록" },
  INCOME: { label: "수입", from: false, to: true, category: true, hint: "급여·상여·부수입·이자" },
  SAVE_INVEST: { label: "저축·투자", from: true, to: true, category: false, hint: "적금 납입, 증권계좌 입금 — 지출이 아니라 저축률에 반영" },
  TRANSFER: { label: "이체", from: true, to: true, category: false, hint: "내 계좌끼리 이동, 카드대금 결제 — 통계 미반영" },
  LOAN_REPAY: { label: "대출상환", from: true, to: true, category: false, hint: "원금만 기록 (이자는 지출로 따로)" },
  ADJUSTMENT: { label: "잔액보정", from: false, to: false, category: false, hint: "평가손익·오차 보정 — 순자산만 반영" },
};

export const TX_TYPES_ORDER: TxType[] = ["EXPENSE", "INCOME", "SAVE_INVEST", "TRANSFER", "LOAN_REPAY", "ADJUSTMENT"];

/** 위반 메시지 목록 (빈 배열이면 유효) */
export function validateTxShape(tx: TxShape): string[] {
  const errors: string[] = [];
  const meta = TX_TYPE_META[tx.type];
  const hasFrom = !!tx.fromAccountId;
  const hasTo = !!tx.toAccountId;

  if (tx.type === "ADJUSTMENT") {
    if (hasFrom === hasTo) errors.push("잔액보정은 늘어날 계좌 또는 줄어들 계좌 중 하나만 선택하세요.");
    return errors;
  }
  if (meta.from && !hasFrom) errors.push("출금 계좌를 선택하세요.");
  if (meta.to && !hasTo) errors.push("입금 계좌를 선택하세요.");
  if (!meta.from && hasFrom) errors.push(`${meta.label}에는 출금 계좌가 없습니다.`);
  if (!meta.to && hasTo) errors.push(`${meta.label}에는 입금 계좌가 없습니다.`);
  if (hasFrom && hasTo && tx.fromAccountId === tx.toAccountId) errors.push("같은 계좌끼리는 이동할 수 없습니다.");
  if (meta.category && !tx.categoryId) errors.push("카테고리를 선택하세요.");
  if (!meta.category && tx.categoryId) errors.push(`${meta.label}에는 카테고리를 쓰지 않습니다.`);

  if (tx.type === "SAVE_INVEST" && tx.toAccountType && !SAVING_DESTINATION_TYPES.includes(tx.toAccountType)) {
    errors.push("저축·투자는 예적금·투자·연금·부동산 계좌로만 보낼 수 있습니다.");
  }
  if (tx.type === "LOAN_REPAY" && tx.toAccountType && tx.toAccountType !== "LOAN") {
    errors.push("대출상환의 입금 계좌는 대출 계좌여야 합니다.");
  }
  if (tx.type === "INCOME" && tx.toAccountType && LIABILITY_TYPES.includes(tx.toAccountType)) {
    errors.push("수입은 부채 계좌로 받을 수 없습니다.");
  }
  return errors;
}

/** 거래 기본 공개범위: 출금 계좌 → 입금 계좌 순으로 계좌 기본값을 따른다 */
export function defaultVisibilityFor<T extends { defaultVisibility: V }, V>(
  from: T | null | undefined,
  to: T | null | undefined,
  fallback: V,
): V {
  return from?.defaultVisibility ?? to?.defaultVisibility ?? fallback;
}
