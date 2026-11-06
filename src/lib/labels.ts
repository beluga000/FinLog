import type { AccountType, BudgetBucket, Visibility } from "@/lib/finance/types";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CASH: "현금",
  CHECKING: "입출금",
  SAVINGS: "예적금",
  INVESTMENT: "투자",
  PENSION: "연금",
  REAL_ESTATE: "부동산·보증금",
  OTHER_ASSET: "기타자산",
  CREDIT_CARD: "신용카드",
  LOAN: "대출",
};

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "CHECKING", "CASH", "SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET", "CREDIT_CARD", "LOAN",
];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  SHARED: "공유",
  SUMMARY_ONLY: "합계만",
  PRIVATE: "비공개",
};

export const VISIBILITY_HINT: Record<Visibility, string> = {
  SHARED: "배우자에게 전체 내역이 보여요",
  SUMMARY_ONLY: "배우자에게는 카테고리 합계만 보여요",
  PRIVATE: "배우자에게 보이지 않고 우리 합계에서도 빠져요",
};

export const BUCKET_LABEL: Record<BudgetBucket, string> = {
  NEEDS: "필수",
  WANTS: "선택",
  SAVINGS: "저축",
};

export const SCOPE_LABEL = { us: "우리", me: "나", partner: "배우자" } as const;

/** 이름 뒤 방향 조사 — 받침 없거나 ㄹ 받침이면 "로", 그 외 받침이면 "으로" ("비상금으로", "내 집 마련으로", "여행로" ✗) */
export function withRo(name: string): string {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${name}(으)로`;
  const jong = (c - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${name}로` : `${name}으로`;
}
