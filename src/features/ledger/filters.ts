import type { TxType } from "@/lib/finance/types";

/** 가계부 유형 필터 칩 — 서버(주소 검증)·화면이 같이 쓴다 */
export const TYPE_FILTERS: { value: string; label: string; types: TxType[] }[] = [
  { value: "", label: "전체", types: [] },
  { value: "expense", label: "지출", types: ["EXPENSE"] },
  { value: "income", label: "수입", types: ["INCOME"] },
  { value: "saving", label: "저축·투자", types: ["SAVE_INVEST", "LOAN_REPAY"] },
  { value: "transfer", label: "이체·보정", types: ["TRANSFER", "ADJUSTMENT"] },
];
