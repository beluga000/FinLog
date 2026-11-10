import { addDays } from "./period";
import { merchantKey } from "./merchant-match";
import type { DateStr, TxType, Visibility } from "./types";

/**
 * 정기 결제 찾기 — 정기 거래로 등록하지 않았는데 매달 비슷하게 나가는(들어오는) 기록.
 * 같은 사용처에서 금액이 비슷한 기록이 서로 다른 3달 이상, 한 달에 한 번꼴, 비슷한 날에 있으면 후보로 본다.
 * 사용처가 같아도 금액이 들쭉날쭉한 기록(쿠팡 장보기)은 빼고, 그 안에서 일정한 금액(쿠팡와우)만 고른다.
 * 순수 함수 — 조회 범위(최근 6달, 볼 수 있는 기록)는 부르는 쪽이 정한다.
 */

export interface DetectTx {
  type: TxType;
  date: DateStr;
  amount: bigint;
  merchant: string | null;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  visibility: Visibility;
  /** 이미 정기 규칙으로 생긴 기록은 후보에서 뺀다 */
  recurringRuleId: string | null;
}

export interface RecurringCandidate {
  /** `${type}:${merchantKey}` — "아니에요" 기억 키 */
  key: string;
  type: TxType;
  merchant: string;
  /** 가장 최근 금액 (값이 오르면 최근 것을 따른다) */
  amount: bigint;
  minAmount: bigint;
  maxAmount: bigint;
  /** 매달 며칠쯤 (기록된 날의 가운데 값) */
  dayOfMonth: number;
  /** 기록된 달 수 */
  months: number;
  lastDate: DateStr;
  /** 등록하면 이날부터 — 마지막 기록 다음 날이라 이미 기록된 달을 다시 만들지 않는다 */
  startDate: DateStr;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  visibility: Visibility;
}

/** 사용처를 찾을 거래 종류 — 저축·이체는 사용처 없이 계좌로 오가서 제외 */
const TYPES: TxType[] = ["EXPENSE", "INCOME"];
/** 같은 금액으로 보는 폭 (가장 흔한 금액 기준) */
const AMOUNT_TOLERANCE = 0.1;
const MIN_MONTHS = 3;
/** 날짜가 이만큼 안에 모여 있어야 한다 (결제일 주말 밀림·말일 차이) */
const DAY_SPREAD = 6;
/** 마지막 기록이 이보다 오래되면 끊긴 것으로 본다 */
const STALE_DAYS = 45;

export const recurringCandidateKey = (type: TxType, merchant: string) => `${type}:${merchantKey(merchant)}`;

const day = (d: DateStr) => Number(d.slice(8, 10));
const month = (d: DateStr) => d.slice(0, 7);

/**
 * 날짜 모음이 DAY_SPREAD 안에 모이는지 + 가운데 날.
 * 말일·초하루에 걸친 경우(31·1·30일)는 초순을 전달 말일 뒤로 보고 다시 잰다 — wrapped 면 초순 기록은 전달 몫이다.
 */
function daySpread(days: number[]): { ok: boolean; median: number; wrapped: boolean } {
  const check = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { ok: s[s.length - 1] - s[0] <= DAY_SPREAD, median: s[Math.floor((s.length - 1) / 2)] };
  };
  const plain = check(days);
  if (plain.ok) return { ...plain, wrapped: false };
  const wrapped = check(days.map((d) => (d <= DAY_SPREAD ? d + 31 : d)));
  if (!wrapped.ok) return { ...plain, wrapped: false };
  return { ok: true, median: wrapped.median > 31 ? 31 : wrapped.median, wrapped: true };
}

/** 가장 흔한 금액 (같으면 최근 것) — 금액 무리를 이 값 주변으로 잡는다 */
function modeAmount(txs: DetectTx[]): bigint {
  const count = new Map<bigint, number>();
  for (const t of txs) count.set(t.amount, (count.get(t.amount) ?? 0) + 1);
  let best = txs[txs.length - 1].amount;
  for (const t of [...txs].reverse()) if ((count.get(t.amount) ?? 0) > (count.get(best) ?? 0)) best = t.amount;
  return best;
}

const near = (a: bigint, base: bigint) => {
  const diff = a > base ? a - base : base - a;
  return Number(diff) <= Number(base) * AMOUNT_TOLERANCE;
};

export function findRecurringCandidates(
  txs: DetectTx[],
  opts: { today: DateStr; /** 이미 등록한 규칙의 키 (중지한 규칙 포함) */ ruleKeys: Set<string>; dismissed: Set<string> },
): RecurringCandidate[] {
  const groups = new Map<string, DetectTx[]>();
  for (const t of txs) {
    if (!TYPES.includes(t.type) || t.recurringRuleId || t.amount <= 0n) continue;
    const name = t.merchant?.trim();
    if (!name || !merchantKey(name)) continue;
    const k = recurringCandidateKey(t.type, name);
    if (opts.ruleKeys.has(k) || opts.dismissed.has(k)) continue;
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }

  const staleBefore = addDays(opts.today, -STALE_DAYS);
  const out: RecurringCandidate[] = [];
  for (const [key, all] of groups) {
    if (all.length < MIN_MONTHS) continue;
    const sorted = [...all].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const base = modeAmount(sorted);
    const hits = sorted.filter((t) => near(t.amount, base));
    const spread = daySpread(hits.map((t) => day(t.date)));
    if (!spread.ok) continue;
    // 말일에서 초하루로 밀린 결제는 전달 몫으로 센다
    const months = new Set(hits.map((t) => month(spread.wrapped && day(t.date) <= DAY_SPREAD ? addDays(t.date, -DAY_SPREAD - 1) : t.date)));
    // 한 달에 한 번꼴 — 한 번 정도 더 찍힌 달(환불 후 재결제)은 봐준다
    if (months.size < MIN_MONTHS || hits.length > months.size + 1) continue;
    const last = hits[hits.length - 1];
    if (last.date < staleBefore) continue;
    const amounts = hits.map((t) => t.amount);
    out.push({
      key,
      type: last.type,
      merchant: last.merchant!.trim(),
      amount: last.amount,
      minAmount: amounts.reduce((a, b) => (b < a ? b : a)),
      maxAmount: amounts.reduce((a, b) => (b > a ? b : a)),
      dayOfMonth: spread.median,
      months: months.size,
      lastDate: last.date,
      startDate: addDays(last.date, 1),
      categoryId: last.categoryId,
      fromAccountId: last.fromAccountId,
      toAccountId: last.toAccountId,
      visibility: last.visibility,
    });
  }
  // 수입 먼저, 그다음 큰 금액부터
  return out.sort((a, b) => (a.type === b.type ? (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0) : a.type === "INCOME" ? -1 : 1));
}
