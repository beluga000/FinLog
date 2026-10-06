import type { DateStr, MonthKey } from "./types";

/**
 * 가구의 "월 시작일" 기준 월 경계 (PROD.MD §2-6).
 * - monthStartDay = 1  → "2026-10" = 10/01 ~ 10/31
 * - monthStartDay = 25 → "2026-10" = 09/25 ~ 10/24 (급여일에 시작하는 달은 다음 달 이름을 갖는다)
 * 날짜는 모두 "YYYY-MM-DD" 문자열로 다뤄 시간대 문제를 피한다.
 */

export function clampStartDay(day: number): number {
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

export function toDateStr(y: number, m: number, d: number): DateStr {
  // m: 1~12 (범위를 넘으면 연도 이월)
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function parseMonthKey(key: MonthKey): { y: number; m: number } {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
}

export function toMonthKey(y: number, m: number): MonthKey {
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toISOString().slice(0, 7);
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { y, m } = parseMonthKey(key);
  return toMonthKey(y, m + delta);
}

/** [start, endExclusive) */
export function getMonthRange(key: MonthKey, monthStartDay: number): { start: DateStr; end: DateStr } {
  const d = clampStartDay(monthStartDay);
  const { y, m } = parseMonthKey(key);
  if (d === 1) return { start: toDateStr(y, m, 1), end: toDateStr(y, m + 1, 1) };
  return { start: toDateStr(y, m - 1, d), end: toDateStr(y, m, d) };
}

/** 날짜가 속한 월 키 */
export function getMonthKey(date: DateStr, monthStartDay: number): MonthKey {
  const d = clampStartDay(monthStartDay);
  const [y, m, day] = date.split("-").map(Number);
  if (d === 1 || day < d) return toMonthKey(y, m);
  return toMonthKey(y, m + 1);
}

export function inRange(date: DateStr, range: { start: DateStr; end: DateStr }): boolean {
  return date >= range.start && date < range.end;
}

/** 오늘 날짜 (Asia/Seoul) */
export function todayKST(now: Date = new Date()): DateStr {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 두 날짜 사이 개월 수 (from 기준 같은 일자를 넘기면 1개월) — 목표 기간 계산용 */
export function monthsBetween(from: DateStr, to: DateStr): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

export function formatMonthLabel(key: MonthKey): string {
  const { y, m } = parseMonthKey(key);
  return `${y}년 ${m}월`;
}

export function addDays(date: DateStr, days: number): DateStr {
  const [y, m, d] = date.split("-").map(Number);
  return toDateStr(y, m, d + days);
}
