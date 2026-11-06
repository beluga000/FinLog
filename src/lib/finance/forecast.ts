import { billingDateIn } from "./card-billing";
import { addDays, shiftMonth } from "./period";
import { scheduledDateFor, type RecurringSchedule } from "./recurring";
import type { DateStr, TxType } from "./types";

/**
 * 통장 잔액 예보 — 앞으로 N일 동안 통장별 잔액이 어떻게 움직일지.
 * 재료: 정기 규칙(월급·관리비·대출이자·자동이체), 카드 결제일과 미결제 사용액, 최근 하루 평균 변동 지출.
 * 예측이므로 "모자랄 것 같아요"로만 말하고, 실제 이체는 사용자가 기록한다.
 */

export const FORECAST_DAYS = 30;
/** 변동 지출 하루 평균을 내는 기간 */
export const DAILY_SPEND_LOOKBACK_DAYS = 90;

export interface ForecastRule extends RecurringSchedule {
  name: string;
  type: TxType;
  amount: bigint;
  fromAccountId: string | null;
  toAccountId: string | null;
  lastRunOn: DateStr | null;
}

export interface ForecastCard {
  id: string;
  name: string;
  billingDay: number;
  paymentAccountId: string;
  /** 지금 미결제 사용액 (양수) */
  unpaid: bigint;
  /** 카드로 쓰는 변동 지출 하루 평균 — 다음 결제 주기 대금 추정용 */
  dailySpend: bigint;
}

export interface ForecastAccount {
  id: string;
  name: string;
  balance: bigint;
  /** 이 통장에서 바로 나가는 변동 지출 하루 평균 (체크카드·현금 등) */
  dailySpend: bigint;
}

export interface ForecastEvent {
  date: DateStr;
  accountId: string;
  /** + 들어옴 / − 나감 */
  amount: bigint;
  label: string;
}

export interface AccountForecast {
  id: string;
  name: string;
  start: bigint;
  /** 오늘 ~ 오늘+days, 하루 하나 (그날 끝 잔액) */
  points: { date: DateStr; balance: bigint }[];
  events: ForecastEvent[];
  low: { date: DateStr; balance: bigint };
  /** 처음으로 0 아래로 내려가는 날과 모자라는 금액 (가장 낮을 때 기준) */
  shortfall: { date: DateStr; amount: bigint } | null;
}

/** today(포함) ~ until(포함) 사이 규칙 발생일 — 이미 실행한 날은 뺀다 */
export function upcomingRuleDates(rule: RecurringSchedule & { lastRunOn: DateStr | null }, today: DateStr, until: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let mk = shiftMonth(today.slice(0, 7), -1); mk <= until.slice(0, 7); mk = shiftMonth(mk, 1)) {
    const [y, m] = mk.split("-").map(Number);
    const d = scheduledDateFor(y, m, rule);
    if (d < today || d > until || d < rule.startDate) continue;
    if (rule.endDate && d > rule.endDate) continue;
    if (rule.lastRunOn && d <= rule.lastRunOn) continue;
    if (!out.includes(d)) out.push(d);
  }
  return out.sort();
}

/** today(포함) ~ until(포함) 사이 카드 결제일 */
function billingDates(billingDay: number, today: DateStr, until: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let mk = today.slice(0, 7); mk <= until.slice(0, 7); mk = shiftMonth(mk, 1)) {
    const [y, m] = mk.split("-").map(Number);
    const d = billingDateIn(y, m, billingDay);
    if (d >= today && d <= until) out.push(d);
  }
  return out;
}

export function forecastEvents(input: { accounts: ForecastAccount[]; rules: ForecastRule[]; cards: ForecastCard[]; today: DateStr; days?: number }): ForecastEvent[] {
  const until = addDays(input.today, input.days ?? FORECAST_DAYS);
  const ids = new Set(input.accounts.map((a) => a.id));
  const events: ForecastEvent[] = [];
  for (const r of input.rules) {
    if (r.amount <= 0n) continue;
    const from = r.fromAccountId && ids.has(r.fromAccountId) ? r.fromAccountId : null;
    const to = r.toAccountId && ids.has(r.toAccountId) ? r.toAccountId : null;
    if (!from && !to) continue;
    for (const date of upcomingRuleDates(r, input.today, until)) {
      if (from) events.push({ date, accountId: from, amount: -r.amount, label: r.name });
      if (to) events.push({ date, accountId: to, amount: r.amount, label: r.name });
    }
  }
  for (const c of input.cards) {
    if (!ids.has(c.paymentAccountId)) continue;
    let prev: DateStr | null = null;
    for (const date of billingDates(c.billingDay, input.today, until)) {
      // 첫 결제는 지금 미결제액, 그다음은 그 사이 쓸 것으로 보이는 금액
      const amount: bigint = prev === null ? c.unpaid : c.dailySpend * BigInt(daysBetween(prev, date));
      if (amount > 0n) events.push({ date, accountId: c.paymentAccountId, amount: -amount, label: `${c.name} 대금` });
      prev = date;
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function forecastBalances(input: { accounts: ForecastAccount[]; rules: ForecastRule[]; cards: ForecastCard[]; today: DateStr; days?: number }): AccountForecast[] {
  const days = input.days ?? FORECAST_DAYS;
  const events = forecastEvents(input);
  return input.accounts.map((a) => {
    const mine = events.filter((e) => e.accountId === a.id);
    const points: AccountForecast["points"] = [];
    let balance = a.balance;
    let shortfallDate: DateStr | null = null;
    let low = { date: input.today, balance: a.balance };
    for (let i = 0; i <= days; i++) {
      const date = addDays(input.today, i);
      // 오늘 쓴 돈은 이미 잔액에 들어 있다 — 변동 지출은 내일부터
      if (i > 0) balance -= a.dailySpend;
      for (const e of mine) if (e.date === date) balance += e.amount;
      points.push({ date, balance });
      if (balance < low.balance) low = { date, balance };
      if (balance < 0n && shortfallDate === null) shortfallDate = date;
    }
    return {
      id: a.id,
      name: a.name,
      start: a.balance,
      points,
      events: mine,
      low,
      shortfall: shortfallDate ? { date: shortfallDate, amount: -low.balance } : null,
    };
  });
}

/** 모자라는 날까지 크게 나가는 것 두 개 — "20일 카드 대금 272만 · 21일 관리비 25만" */
export function bigOutflowsBefore(f: AccountForecast, date: DateStr, limit = 2): ForecastEvent[] {
  return f.events
    .filter((e) => e.amount < 0n && e.date <= date)
    .sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0))
    .slice(0, limit)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 모자라는 통장에 옮길 통장 — 옮겨도 예보 기간 내내 0 위에 남는 곳 중 가장 여유 있는 곳 */
export function pickTransferSource(forecasts: AccountForecast[], targetId: string, amount: bigint): AccountForecast | null {
  return (
    forecasts
      .filter((f) => f.id !== targetId && f.low.balance - amount >= 0n)
      .sort((a, b) => (b.low.balance > a.low.balance ? 1 : b.low.balance < a.low.balance ? -1 : 0))[0] ?? null
  );
}

/** 옮길 금액은 만 원 단위로 올린다 */
export function roundUpToManwon(amount: bigint): bigint {
  return ((amount + 9_999n) / 10_000n) * 10_000n;
}
