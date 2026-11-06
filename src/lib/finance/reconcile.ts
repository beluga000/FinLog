import { isLiability } from "./balance";
import { addDays, shiftMonth } from "./period";
import { scheduledDateFor, type RecurringSchedule } from "./recurring";
import type { AccountType, DateStr, MonthKey } from "./types";

/**
 * 잔액 한 번에 맞추기 — 계좌마다 따로 잔액을 고치다 미루지 않게, 월급날·낡은 계좌가 쌓였을 때 한 장으로 모은다.
 * 순수 함수 — 화면(클라이언트)과 확인할 일(서버)이 같이 쓴다.
 */

/** 평가액 계좌 잔액을 다시 물어보는 간격 */
export const STALE_BALANCE_DAYS = 30;
/** "1년에 한 번만" 고른 계좌 (전세보증금 등) */
export const YEARLY_BALANCE_DAYS = 365;
/** 월급이 들어온 날부터 며칠 동안 "잔액 맞추기"를 띄우는지 */
export const PAYDAY_WINDOW_DAYS = 3;
/** 낡은 계좌가 이만큼 쌓이면 한 줄씩 대신 "한 번에 맞추기"로 묶는다 */
export const RECONCILE_BUNDLE_MIN = 2;

/** 마지막 잔액 입력이 기준 기간보다 오래됐는지 (입력이 없으면 낡음) */
export function isBalanceStale(last: DateStr | null, today: DateStr, yearly: boolean): boolean {
  if (last === null) return true;
  return last < addDays(today, -(yearly ? YEARLY_BALANCE_DAYS : STALE_BALANCE_DAYS));
}

/**
 * 오늘이 월급날 직후(월급일 ~ +PAYDAY_WINDOW_DAYS)이면 그 월급일. 여러 수입 규칙이면 가장 최근 것.
 * 이번 달·지난달 예정일을 본다 (말일 월급이 다음 달 초로 보정되는 경우).
 */
export function recentPayday(rules: RecurringSchedule[], today: DateStr): DateStr | null {
  const month = today.slice(0, 7) as MonthKey;
  let best: DateStr | null = null;
  for (const rule of rules) {
    for (const mk of [shiftMonth(month, -1), month]) {
      const [y, m] = mk.split("-").map(Number);
      const date = scheduledDateFor(y, m, rule);
      if (date < rule.startDate || (rule.endDate && date > rule.endDate)) continue;
      if (date > today || addDays(date, PAYDAY_WINDOW_DAYS) < today) continue;
      if (best === null || date > best) best = date;
    }
  }
  return best;
}

export interface ReconcileRow {
  id: string;
  type: AccountType;
  depositLoan?: boolean;
  /** 앱이 계산한 지금 잔액 (저장 기준 — 부채는 음수) */
  balance: bigint;
}

/** 화면 입력값(부채는 갚아야 할 금액을 양수로) → 저장 잔액 */
export function toStored(type: AccountType, display: bigint): bigint {
  if (!isLiability(type)) return display;
  return display < 0n ? display : -display;
}

/** 저장 잔액 → 화면 입력값 */
export function toDisplay(type: AccountType, stored: bigint): bigint {
  return isLiability(type) ? -stored : stored;
}

/**
 * 고친 잔액이 순자산을 얼마나 바꾸는지. 보증금 대출은 순자산에서 빠지므로 제외한다 (summarizeNetWorth 와 같은 기준).
 * next: id → 새 저장 잔액 (없는 계좌는 그대로)
 */
export function netWorthDelta(rows: ReconcileRow[], next: Map<string, bigint>): bigint {
  let delta = 0n;
  for (const r of rows) {
    if (r.type === "LOAN" && r.depositLoan) continue;
    const v = next.get(r.id);
    if (v !== undefined) delta += v - r.balance;
  }
  return delta;
}
