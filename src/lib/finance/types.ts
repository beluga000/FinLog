// lib/finance 전용 타입. Prisma 타입에 의존하지 않는다 (순수 함수 + 클라이언트 재사용).

export type TxType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "SAVE_INVEST"
  | "LOAN_REPAY"
  | "ADJUSTMENT";

export type Visibility = "SHARED" | "SUMMARY_ONLY" | "PRIVATE";

export type BudgetBucket = "NEEDS" | "WANTS" | "SAVINGS";

export type AccountType =
  | "CASH"
  | "CHECKING"
  | "SAVINGS"
  | "INVESTMENT"
  | "PENSION"
  | "REAL_ESTATE"
  | "OTHER_ASSET"
  | "CREDIT_CARD"
  | "LOAN";

/** 달력 날짜 "YYYY-MM-DD" (Asia/Seoul 기준, 시간 정보 없음) */
export type DateStr = string;

/** 월 키 "YYYY-MM" — 가구의 월 시작일 기준으로 해석 */
export type MonthKey = string;

export interface LedgerTx {
  id: string;
  type: TxType;
  amount: bigint;
  date: DateStr;
  categoryId: string | null;
  createdByUserId: string;
  visibility: Visibility;
  isFixed: boolean;
  fromAccountId: string | null;
  toAccountId: string | null;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  bucket: BudgetBucket | null;
}
