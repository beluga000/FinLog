import { addDays, lastDayOfMonth, toDateStr } from "./period";
import type { DateStr } from "./types";

/**
 * 정기 거래 발생일 계산 (PROD.MD §2-5).
 * dayOfMonth = 0 → 말일. 31일 같은 값은 해당 월 말일로 보정.
 * businessDayAdjust: 주말이면 PREV(직전 금요일) / NEXT(다음 월요일). 공휴일은 MVP 범위 밖.
 */

export type BusinessDayAdjust = "NONE" | "PREV" | "NEXT";

export interface RecurringSchedule {
  dayOfMonth: number;
  businessDayAdjust: BusinessDayAdjust;
  startDate: DateStr;
  endDate: DateStr | null;
}

function weekday(date: DateStr): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function adjustBusinessDay(date: DateStr, mode: BusinessDayAdjust): DateStr {
  if (mode === "NONE") return date;
  let cur = date;
  const step = mode === "PREV" ? -1 : 1;
  while (weekday(cur) === 0 || weekday(cur) === 6) cur = addDays(cur, step);
  return cur;
}

export function scheduledDateFor(y: number, m: number, rule: Pick<RecurringSchedule, "dayOfMonth" | "businessDayAdjust">): DateStr {
  const last = lastDayOfMonth(y, m);
  const day = rule.dayOfMonth <= 0 ? last : Math.min(rule.dayOfMonth, last);
  return adjustBusinessDay(toDateStr(y, m, day), rule.businessDayAdjust);
}

/** (from, to] 구간에서 발생해야 하는 날짜 목록. from = 마지막 실행일(없으면 null). */
export function dueDates(rule: RecurringSchedule, lastRunOn: DateStr | null, today: DateStr): DateStr[] {
  const result: DateStr[] = [];
  const [sy, sm] = rule.startDate.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  // 영업일 보정으로 다음 달 초로 밀릴 수 있어 한 달 더 확인
  for (let y = sy, m = sm; y < ty || (y === ty && m <= tm + 1); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const date = scheduledDateFor(y, m, rule);
    if (date < rule.startDate) continue;
    if (rule.endDate && date > rule.endDate) continue;
    if (date > today) continue;
    if (lastRunOn && date <= lastRunOn) continue;
    result.push(date);
  }
  return result;
}
