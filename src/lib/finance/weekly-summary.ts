import type { DailyNotice } from "./daily-notice";
import { formatCompactKRW } from "./money";
import { addDays } from "./period";
import type { DateStr } from "./types";

/**
 * 월요일 아침 주간 요약 알림 (PROD.MD §⑤) — "지난주 32만 썼어요 · 평소보다 4만 더 · 외식 +4만 · 이번 주 하루 4.1만".
 * 지난주 = 지난 월~일. 평소 = 그 전 4주 중 변동 지출이 있었던 주의 평균 (가입 직후 빈 주가 평균을 끌어내리지 않게).
 * 변동 지출만 센다 — 월세·보험 같은 고정 지출(정기 거래·고정 체크)은 매주 비교에 잡음만 준다.
 */

export interface WeeklyExpense {
  date: DateStr;
  amount: bigint;
  categoryId: string | null;
  isFixed: boolean;
}

/** 평소와 비교하려면 지출이 있었던 주가 이만큼은 있어야 한다 */
export const WEEKLY_MIN_BASE_WEEKS = 2;
/** 평균과 이만큼 이상 차이 나야 "더/덜" — 아니면 "평소와 비슷해요" */
export const WEEKLY_SIMILAR_MIN = 10_000n;
export const WEEKLY_SIMILAR_RATE = 0.1;
/** 카테고리 증가는 이만큼 이상, 평소의 1.3배 이상일 때만 짚는다 */
export const WEEKLY_CATEGORY_MIN_DIFF = 20_000n;
export const WEEKLY_CATEGORY_MIN_RATE = 1.3;
const BASE_WEEKS = 4;

/** 월요일 — 날짜 문자열은 KST 기준 */
export function isWeeklySummaryDay(today: DateStr): boolean {
  return new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
}

/** 지난주와 비교 기준 4주의 첫날 (가장 이른 날) — 조회 범위 */
export function weeklyRangeStart(today: DateStr): DateStr {
  return addDays(today, -7 * (BASE_WEEKS + 1));
}

export interface WeeklySummary {
  total: bigint;
  /** 평소(지출이 있었던 직전 주들의 평균). 비교할 주가 모자라면 null */
  usual: bigint | null;
  /** 가장 많이 늘어난 대분류 */
  rise: { name: string; diff: bigint } | null;
}

export function summarizeWeek(input: {
  today: DateStr;
  expenses: WeeklyExpense[];
  /** 카테고리 id → 대분류 { id, name } (소분류는 대분류로 묶는다) */
  parentOf: Map<string, { id: string; name: string }>;
}): WeeklySummary {
  const { today } = input;
  // 0 = 지난주, 1..4 = 비교 기준 주
  const weekIndex = (date: DateStr) => {
    for (let k = 0; k <= BASE_WEEKS; k++) {
      const start = addDays(today, -7 * (k + 1));
      if (date >= start && date < addDays(start, 7)) return k;
    }
    return -1;
  };
  const totals = Array.from({ length: BASE_WEEKS + 1 }, () => 0n);
  const byCat = Array.from({ length: BASE_WEEKS + 1 }, () => new Map<string, bigint>());
  const names = new Map<string, string>();
  for (const e of input.expenses) {
    if (e.isFixed) continue;
    const k = weekIndex(e.date);
    if (k < 0) continue;
    totals[k] += e.amount;
    const parent = e.categoryId ? input.parentOf.get(e.categoryId) : undefined;
    if (parent) {
      names.set(parent.id, parent.name);
      byCat[k].set(parent.id, (byCat[k].get(parent.id) ?? 0n) + e.amount);
    }
  }
  const baseWeeks = [1, 2, 3, 4].filter((k) => totals[k] > 0n);
  if (baseWeeks.length < WEEKLY_MIN_BASE_WEEKS) return { total: totals[0], usual: null, rise: null };
  const n = BigInt(baseWeeks.length);
  const usual = baseWeeks.reduce((s, k) => s + totals[k], 0n) / n;

  let rise: WeeklySummary["rise"] = null;
  for (const [id, last] of byCat[0]) {
    const avg = baseWeeks.reduce((s, k) => s + (byCat[k].get(id) ?? 0n), 0n) / n;
    const diff = last - avg;
    if (diff < WEEKLY_CATEGORY_MIN_DIFF || Number(last) < Number(avg) * WEEKLY_CATEGORY_MIN_RATE) continue;
    if (!rise || diff > rise.diff) rise = { name: names.get(id) ?? "", diff };
  }
  return { total: totals[0], usual, rise };
}

export function composeWeeklyNotice(input: {
  summary: WeeklySummary;
  /** 이번 달 쓸 수 있는 돈 (우리 기준) — 오늘부터 하루 몫, 넘었으면 remaining < 0 */
  spendable: { daily: bigint; remaining: bigint } | null;
}): DailyNotice | null {
  const { total, usual, rise } = input.summary;
  if (total === 0n && usual === null) return null;
  const parts: string[] = [];
  if (usual !== null) {
    const diff = total - usual;
    const abs = diff < 0n ? -diff : diff;
    const similar = abs < WEEKLY_SIMILAR_MIN || Number(abs) < Number(usual) * WEEKLY_SIMILAR_RATE;
    parts.push(similar ? "평소와 비슷해요" : diff > 0n ? `평소보다 ${formatCompactKRW(abs)} 더 썼어요` : `평소보다 ${formatCompactKRW(abs)} 덜 썼어요`);
  }
  if (rise) parts.push(`${rise.name} +${formatCompactKRW(rise.diff)}`);
  if (input.spendable) {
    parts.push(
      input.spendable.remaining < 0n ? "이번 달 쓸 수 있는 돈을 넘었어요" : `이번 주 하루 ${formatCompactKRW(input.spendable.daily)}씩 쓸 수 있어요`,
    );
  }
  return {
    title: total > 0n ? `지난주 ${formatCompactKRW(total)} 썼어요` : "지난주엔 쓴 돈이 없어요",
    body: parts.join(" · ") || "가계부에서 지난주 기록을 볼 수 있어요.",
    url: "/ledger",
    tag: "weekly",
  };
}
