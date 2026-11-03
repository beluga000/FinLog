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

function monthOf(date: DateStr): [number, number] {
  const [y, m] = date.split("-").map(Number);
  return [y, m];
}

function prevMonth(y: number, m: number): [number, number] {
  return m === 1 ? [y - 1, 12] : [y, m - 1];
}

function nextMonth(y: number, m: number): [number, number] {
  return m === 12 ? [y + 1, 1] : [y, m + 1];
}

/**
 * 다음에 생성될 날짜 (오늘·마지막 실행일 이후 첫 회차). 종료일을 넘으면 null.
 * 오늘까지 밀린 회차는 materializeRecurring 이 만들므로 여기서는 미래만 본다.
 */
export function nextDueDate(rule: RecurringSchedule, lastRunOn: DateStr | null, today: DateStr): DateStr | null {
  const floor = lastRunOn && lastRunOn > today ? lastRunOn : today;
  const from = rule.startDate > floor ? rule.startDate : floor;
  // 직전 금요일 보정으로 다음 달 회차가 이번 달 말로 당겨질 수 있어 한 달 앞에서부터 본다
  let [y, m] = prevMonth(...monthOf(from));
  for (let i = 0; i < 15; i++, [y, m] = nextMonth(y, m)) {
    const date = scheduledDateFor(y, m, rule);
    if (date <= floor || date < rule.startDate) continue;
    return rule.endDate && date > rule.endDate ? null : date;
  }
  return null;
}

/**
 * 규칙의 날짜(매월 N일·주말 보정)를 바꿀 때 마지막 실행일 보정.
 * 이미 지난 회차가 속한 달의 새 일정 날짜까지 "실행됨"으로 본다 — 같은 달에 두 번 생성되지 않게.
 * 예) 10일분이 11/10 에 생성된 뒤 25일로 변경 → 11/25 는 건너뛰고 12/25 부터.
 *     25일분이 10/25 에 생성된 뒤(오늘 11/3) 1일로 변경 → 11/1 은 아직 안 나간 회차라 생성.
 */
export function lastRunAfterScheduleChange(
  oldRule: Pick<RecurringSchedule, "dayOfMonth" | "businessDayAdjust">,
  newRule: Pick<RecurringSchedule, "dayOfMonth" | "businessDayAdjust">,
  lastRunOn: DateStr,
): DateStr {
  const [ly, lm] = monthOf(lastRunOn);
  // 주말 보정으로 회차가 다음 달로 밀렸을 수 있다 → 마지막 실행일이 어느 달 회차였는지 찾는다
  const covered = [[ly, lm] as [number, number], prevMonth(ly, lm)].find(
    ([y, m]) => scheduledDateFor(y, m, oldRule) === lastRunOn,
  ) ?? [ly, lm];
  const equivalent = scheduledDateFor(covered[0], covered[1], newRule);
  return equivalent > lastRunOn ? equivalent : lastRunOn;
}
