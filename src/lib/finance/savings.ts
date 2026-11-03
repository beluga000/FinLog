import { addDays, monthsBetween } from "./period";
import { dueDates, type RecurringSchedule } from "./recurring";
import type { DateStr } from "./types";

/**
 * 고정 저축(예적금) 만기 예상.
 * - 적금(매달 정기 저축이 들어오는 계좌): 단리 적금 이자 = 월 납입액 × 연 금리/12 × N(N+1)/2 (N = 납입 개월 수)
 *   + 월 납입으로 설명되지 않는 원금(목돈)은 가입일(모르면 오늘)부터 만기까지 단리
 * - 예금(정기 저축 없이 목돈만 있는 계좌): 단리 이자 = 잔액 × 연 금리 × 개월/12
 * 이자소득세는 일반과세 15.4%(소득세 14% + 지방소득세 1.4%)로 본다. 비과세·세금우대 상품은 세후가 실제보다 적게 보인다.
 */

export const INTEREST_TAX_RATE = 0.154;

/** 만기 전에 들어올 정기 저축 한 건 */
export interface FixedDeposit {
  amount: bigint;
  schedule: RecurringSchedule;
  lastRunOn: DateStr | null;
}

/** 오늘(또는 마지막 생성일) 이후 ~ 만기 전날까지 남은 납입 횟수 */
export function remainingDeposits(d: FixedDeposit, today: DateStr, maturity: DateStr): number {
  const floor = d.lastRunOn && d.lastRunOn > today ? d.lastRunOn : today;
  const last = addDays(maturity, -1);
  if (last <= floor) return 0;
  return dueDates(d.schedule, floor, last).length;
}

export interface MaturityEstimate {
  kind: "installment" | "deposit";
  /** 만기 때 원금 = 현재 잔액 + 남은 납입액 */
  principal: bigint;
  interest: bigint;
  tax: bigint;
  afterTax: bigint;
  /** 남은 납입 횟수 (적금) */
  remainingCount: number;
}

export function estimateMaturity(input: {
  balance: bigint;
  deposits: FixedDeposit[];
  /** 연 금리 (0.035 = 3.5%). 모르면 null → 이자 0 */
  annualRate: number | null;
  openedOn: DateStr | null;
  maturityDate: DateStr;
  today: DateStr;
}): MaturityEstimate {
  const { balance, deposits, maturityDate, today } = input;
  const rate = input.annualRate ?? 0;
  const counts = deposits.map((d) => remainingDeposits(d, today, maturityDate));
  const remainingCount = counts.reduce((s, n) => Math.max(s, n), 0);
  const future = deposits.reduce((s, d, i) => s + d.amount * BigInt(counts[i]), 0n);
  const principal = balance + future;
  const monthly = deposits.reduce((s, d) => s + d.amount, 0n);

  let interest: number;
  let kind: MaturityEstimate["kind"];
  if (monthly > 0n) {
    kind = "installment";
    // 가입일을 알면 가입~만기 개월 수, 모르면 만기 원금 ÷ 월 납입액으로 추정
    const n = input.openedOn
      ? Math.max(1, monthsBetween(input.openedOn, maturityDate))
      : Math.max(1, Math.round(Number(principal) / Number(monthly)));
    interest = Number(monthly) * (rate / 12) * ((n * (n + 1)) / 2);
    // 월 납입으로 설명되지 않는 원금(가입 때 넣은 목돈·추가 입금)은 예금처럼 단리로 더한다
    const lump = Number(principal) - Number(monthly) * n;
    if (lump > 0) interest += lump * rate * (monthsBetween(input.openedOn ?? today, maturityDate) / 12);
  } else {
    kind = "deposit";
    const months = monthsBetween(input.openedOn ?? today, maturityDate);
    interest = Number(balance) * rate * (months / 12);
  }
  // 부동소수 오차(116,999.9999…) 보정 후 원 단위 내림
  const interestWon = BigInt(Math.max(0, Math.floor(interest + 1e-6)));
  const tax = BigInt(Math.floor(Number(interestWon) * INTEREST_TAX_RATE));
  return { kind, principal, interest: interestWon, tax, afterTax: principal + interestWon - tax, remainingCount };
}

/** 가입일~만기일 중 오늘까지 지난 비율 (0~1). 둘 중 하나라도 모르면 null */
export function termProgress(openedOn: DateStr | null, maturityDate: DateStr | null, today: DateStr): number | null {
  if (!openedOn || !maturityDate || maturityDate <= openedOn) return null;
  const t = (d: DateStr) => Date.parse(`${d}T00:00:00Z`);
  return Math.min(1, Math.max(0, (t(today) - t(openedOn)) / (t(maturityDate) - t(openedOn))));
}
