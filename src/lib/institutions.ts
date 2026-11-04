import type { AccountType } from "./finance/types";

/** 계좌 추가에서 고르는 금융사 목록. 여기 없는 곳은 '직접 입력' */
export const INSTITUTION_GROUPS = {
  bank: {
    label: "은행",
    items: [
      "KB국민은행", "신한은행", "우리은행", "하나은행", "NH농협은행", "IBK기업은행",
      "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일은행", "한국씨티은행", "KDB산업은행", "Sh수협은행",
      "iM뱅크(대구은행)", "부산은행", "경남은행", "광주은행", "전북은행", "제주은행",
      "우체국", "새마을금고", "신협", "지역농축협",
    ],
  },
  card: {
    label: "카드사",
    items: ["신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드", "우리카드", "하나카드", "BC카드", "NH농협카드", "IBK기업은행카드"],
  },
  securities: {
    label: "증권사",
    items: [
      "미래에셋증권", "한국투자증권", "삼성증권", "KB증권", "NH투자증권", "키움증권", "신한투자증권",
      "토스증권", "카카오페이증권", "하나증권", "대신증권", "메리츠증권", "유안타증권", "한화투자증권",
    ],
  },
  insurance: {
    label: "보험사",
    items: ["삼성생명", "한화생명", "교보생명", "신한라이프", "미래에셋생명", "NH농협생명", "KB라이프", "삼성화재", "현대해상", "DB손해보험"],
  },
  pay: {
    label: "간편결제",
    items: ["카카오페이", "네이버페이", "토스페이"],
  },
} as const;

export type InstitutionGroup = keyof typeof INSTITUTION_GROUPS;

/** 계좌 종류에 맞는 목록을 먼저 보여 준다 (카드 → 카드사, 투자 → 증권사 …) */
const GROUP_ORDER: Partial<Record<AccountType, InstitutionGroup[]>> = {
  CREDIT_CARD: ["card", "bank", "pay"],
  INVESTMENT: ["securities", "bank"],
  PENSION: ["securities", "insurance", "bank"],
  LOAN: ["bank", "card", "insurance"],
  CASH: ["pay", "bank"],
};
const DEFAULT_ORDER: InstitutionGroup[] = ["bank", "securities", "card", "insurance", "pay"];

export function institutionGroupsFor(type: AccountType): { label: string; items: readonly string[] }[] {
  const first = GROUP_ORDER[type] ?? [];
  const order = [...first, ...DEFAULT_ORDER.filter((g) => !first.includes(g))];
  return order.map((g) => INSTITUTION_GROUPS[g]);
}

export function isKnownInstitution(name: string): boolean {
  return Object.values(INSTITUTION_GROUPS).some((g) => (g.items as readonly string[]).includes(name));
}
