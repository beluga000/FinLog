import { billingDateIn } from "./card-billing";
import { shiftMonth } from "./period";
import type { DateStr } from "./types";

/**
 * 신용카드 할부.
 * 지출 기록은 산 날 전체 금액 한 건이다 (그달에 그만큼 쓴 것). 할부 개월은 카드값이 언제 얼마 나가는지에만 쓴다 —
 * 통장 예보·카드 결제 예정 금액이 아직 청구되지 않은 할부 원금까지 한꺼번에 나간다고 보지 않게.
 */

/** 입력 폼에서 고르는 할부 개월 */
export const INSTALLMENT_MONTH_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36] as const;
export const MAX_INSTALLMENT_MONTHS = 60;

export interface InstallmentPurchase {
  date: DateStr;
  amount: bigint;
  months: number;
}

export interface InstallmentCharge {
  /** 이 회차가 청구되는 결제일 */
  date: DateStr;
  amount: bigint;
  /** 1부터 */
  seq: number;
}

/**
 * 회차별 청구 — 산 날 뒤 처음 오는 결제일부터 매달 한 회차씩 (산 날이 결제일이면 다음 달부터).
 * 원 단위로 나누어떨어지지 않는 나머지는 1회차에 붙인다 (카드사 관행). 이자·수수료는 모른다 — 원금만.
 * 결제일을 모르는 카드는 산 날과 같은 날짜를 결제일로 본다.
 */
export function installmentCharges(p: InstallmentPurchase, billingDay: number | null): InstallmentCharge[] {
  if (p.months < 2 || p.amount <= 0n) return [];
  const day = billingDay ?? Number(p.date.slice(8, 10));
  const per = p.amount / BigInt(p.months);
  const first = p.amount - per * BigInt(p.months - 1);
  let mk = p.date.slice(0, 7);
  const dateIn = (key: string) => {
    const [y, m] = key.split("-").map(Number) as [number, number];
    return billingDateIn(y, m, day);
  };
  if (dateIn(mk) <= p.date) mk = shiftMonth(mk, 1);
  const out: InstallmentCharge[] = [];
  for (let i = 0; i < p.months; i++, mk = shiftMonth(mk, 1)) {
    out.push({ date: dateIn(mk), amount: i === 0 ? first : per, seq: i + 1 });
  }
  return out;
}

/** 여러 할부의 회차를 결제일 순으로 */
export function allInstallmentCharges(purchases: InstallmentPurchase[], billingDay: number | null): InstallmentCharge[] {
  return purchases.flatMap((p) => installmentCharges(p, billingDay)).sort((a, b) => a.date.localeCompare(b.date));
}

/** after 보다 뒤(after 제외)에 청구될 할부금 — 아직 카드값에 붙지 않은 원금 */
export function chargesAfter(charges: InstallmentCharge[], after: DateStr): bigint {
  return charges.reduce((s, c) => (c.date > after ? s + c.amount : s), 0n);
}

/** (from, to] 사이 청구되는 할부금. from 이 null 이면 to 까지 전부 */
export function chargesBetween(charges: InstallmentCharge[], from: DateStr | null, to: DateStr): bigint {
  return charges.reduce((s, c) => ((from === null || c.date > from) && c.date <= to ? s + c.amount : s), 0n);
}

/**
 * 이 결제일에 낼 카드값 = 카드 잔액(미결제 전부) − 그 뒤에 청구될 할부 원금. 0 아래로는 내려가지 않는다.
 * (할부 회차를 미리 갚았거나 기록이 빠져 잔액이 더 작으면 0)
 */
export function billForDate(unpaid: bigint, charges: InstallmentCharge[], date: DateStr): bigint {
  const bill = unpaid - chargesAfter(charges, date);
  return bill > 0n ? bill : 0n;
}

export interface InstallmentStatus {
  /** 오늘 이후(오늘 포함) 청구될 할부 원금 합 */
  remaining: bigint;
  /** 아직 회차가 남은 할부 건수 */
  count: number;
  /** 가장 가까운 결제일과 그날 붙는 할부금 */
  next: { date: DateStr; amount: bigint } | null;
}

export function installmentStatus(purchases: InstallmentPurchase[], billingDay: number | null, today: DateStr): InstallmentStatus {
  let remaining = 0n;
  let count = 0;
  let next: InstallmentStatus["next"] = null;
  for (const p of purchases) {
    const left = installmentCharges(p, billingDay).filter((c) => c.date >= today);
    if (!left.length) continue;
    count++;
    for (const c of left) {
      remaining += c.amount;
      if (!next || c.date < next.date) next = { date: c.date, amount: c.amount };
      else if (c.date === next.date) next = { date: next.date, amount: next.amount + c.amount };
    }
  }
  return { remaining, count, next };
}
