import { addDays } from "./period";
import { dueDates } from "./recurring";
import type { DateStr } from "./types";

/**
 * 대출 상환 계산 — 남은 원금(현재 잔액)과 남은 납입 횟수로 매달 낼 돈을 다시 계산한다.
 * 처음 대출 원금·지난 상환 내역을 몰라도 되고, 중도상환으로 잔액이 바뀌어도 그대로 맞는다.
 * - 만기일시: 매달 이자(남은 원금 × 월 금리)만, 만기에 원금 전부
 * - 원리금균등: 매달 같은 금액 A = P·r / (1 − (1+r)^−n). 이자는 남은 원금 × r, 나머지가 원금
 * - 원금균등: 매달 원금 P/n + 그달 이자. 이자가 줄어 낼 돈도 매달 준다
 * 월 금리 r = 연 금리 / 12 (은행 실제 일할 계산과 몇백 원 다를 수 있다). 원 단위 반올림.
 */

export const LOAN_REPAYMENTS = ["BULLET", "EQUAL_PAYMENT", "EQUAL_PRINCIPAL"] as const;
export type LoanRepayment = (typeof LOAN_REPAYMENTS)[number];

export const LOAN_REPAYMENT_LABEL: Record<LoanRepayment, string> = {
  BULLET: "만기일시상환",
  EQUAL_PAYMENT: "원리금균등상환",
  EQUAL_PRINCIPAL: "원금균등상환",
};

export const LOAN_REPAYMENT_HINT: Record<LoanRepayment, string> = {
  BULLET: "매달 이자만 내고 만기에 원금을 한 번에 갚아요.",
  EQUAL_PAYMENT: "원금과 이자를 합쳐 매달 같은 금액을 내요.",
  EQUAL_PRINCIPAL: "원금을 매달 똑같이 나눠 갚고, 이자는 남은 원금만큼이라 점점 줄어요.",
};

export function isLoanRepayment(v: unknown): v is LoanRepayment {
  return typeof v === "string" && (LOAN_REPAYMENTS as readonly string[]).includes(v);
}

export interface LoanTerms {
  /** 남은 원금 (양수, 원) */
  balance: bigint;
  /** 연 금리 (0.045 = 4.5%) */
  annualRate: number;
  repayment: LoanRepayment;
  /** 매달 납입일 (1~31). 모르면 만기일의 날짜 */
  payDay: number | null;
  /** 만기일. 모르면 null — 만기일시상환의 이자만 계산할 수 있다 */
  maturityDate: DateStr | null;
}

export interface LoanPayment {
  date: DateStr | null;
  principal: bigint;
  interest: bigint;
  total: bigint;
}

export interface LoanPlan {
  /** 다음 납입 (오늘 포함) */
  next: LoanPayment;
  /** 오늘부터 만기까지 남은 납입 횟수 (만기일을 모르면 null) */
  remainingCount: number | null;
  /** 남은 이자 합계 (만기일을 모르면 null) */
  totalInterest: bigint | null;
}

const won = (x: number) => BigInt(Math.max(0, Math.round(x)));

/** 오늘(포함) ~ 만기일(포함) 사이 납입일 목록 */
export function remainingPaymentDates(payDay: number | null, maturityDate: DateStr, today: DateStr): DateStr[] {
  if (maturityDate < today) return [];
  const day = payDay ?? Number(maturityDate.slice(8, 10));
  const dates = dueDates({ dayOfMonth: day, businessDayAdjust: "NONE", startDate: today, endDate: maturityDate }, addDays(today, -1), maturityDate);
  // 만기일이 납입일과 어긋나도 마지막 상환은 만기일에 한다
  if (!dates.length || dates[dates.length - 1] < maturityDate) dates.push(maturityDate);
  return dates;
}

export function loanPlan(t: LoanTerms, today: DateStr): LoanPlan | null {
  const P = Number(t.balance);
  if (P <= 0 || !Number.isFinite(t.annualRate) || t.annualRate < 0) return null;
  const r = t.annualRate / 12;
  const interest = P * r;

  if (!t.maturityDate) {
    // 만기를 모르면 매달 이자만 알 수 있다 (만기일시상환일 때만 의미 있음)
    if (t.repayment !== "BULLET") return null;
    return { next: { date: null, principal: 0n, interest: won(interest), total: won(interest) }, remainingCount: null, totalInterest: null };
  }

  const dates = remainingPaymentDates(t.payDay, t.maturityDate, today);
  const n = dates.length;
  if (n === 0) return null;
  const last = n === 1;

  if (t.repayment === "BULLET") {
    const principal = last ? t.balance : 0n;
    const i = won(interest);
    return { next: { date: dates[0], principal, interest: i, total: principal + i }, remainingCount: n, totalInterest: won(interest * n) };
  }

  if (t.repayment === "EQUAL_PAYMENT") {
    const payment = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    const i = won(interest);
    const principal = last ? t.balance : won(payment - interest);
    return { next: { date: dates[0], principal, interest: i, total: principal + i }, remainingCount: n, totalInterest: won(payment * n - P) };
  }

  // 원금균등: 이자 합계 = r·P·(n+1)/2
  const principal = last ? t.balance : won(P / n);
  const i = won(interest);
  return { next: { date: dates[0], principal, interest: i, total: principal + i }, remainingCount: n, totalInterest: won((r * P * (n + 1)) / 2) };
}
