import { addDays, lastDayOfMonth, toDateStr } from "./period";
import type { DateStr } from "./types";

/** 결제일 알림 창: 결제일 5일 전부터 2일 뒤까지 (늦게 확인해도 놓치지 않게) */
export const CARD_DUE_BEFORE_DAYS = 5;
export const CARD_DUE_AFTER_DAYS = 2;

/** y년 m월의 결제일. 31일 결제인데 30일까지인 달이면 말일 */
export function billingDateIn(y: number, m: number, billingDay: number): DateStr {
  return toDateStr(y, m, Math.min(billingDay, lastDayOfMonth(y, m)));
}

/**
 * 오늘이 알림 창 안에 드는 결제 예정일. 없으면 null.
 * 지난달·이번 달·다음 달 결제일 중 창에 드는 것을 찾는다 (예: 11/30 에 12/2 결제, 12/1 에 11/30 결제).
 */
export function upcomingCardDue(
  today: DateStr,
  billingDay: number,
  opts: { before?: number; after?: number } = {},
): DateStr | null {
  const before = opts.before ?? CARD_DUE_BEFORE_DAYS;
  const after = opts.after ?? CARD_DUE_AFTER_DAYS;
  const [y, m] = today.split("-").map(Number) as [number, number];
  for (const delta of [-1, 0, 1]) {
    const mm = m + delta;
    const due = billingDateIn(mm < 1 ? y - 1 : mm > 12 ? y + 1 : y, ((mm + 11) % 12) + 1, billingDay);
    if (addDays(due, -before) <= today && today <= addDays(due, after)) return due;
  }
  return null;
}
