import { inflate, toMonthlyRate } from "./projection";
import type { DateStr, MonthKey } from "./types";

/**
 * 생활 변화 (PROD.MD Phase 3 "라이프 이벤트", 페르소나 P3) — 출산·육아휴직·이사처럼 매달 저축이 바뀌거나 한 번에 큰돈이 나가는 일.
 * 목표 "만약에"에서 지금 계획의 매달 저축에 더하고 빼서 달성 시점을 다시 계산한다.
 * 금액은 원 단위 number (화면 계산용, 시뮬레이터와 같다).
 */

export const LIFE_EVENT_KINDS = ["BIRTH", "PARENTAL_LEAVE", "MOVE", "WEDDING", "INCOME_CHANGE", "OTHER"] as const;
export type LifeEventKind = (typeof LIFE_EVENT_KINDS)[number];

export const LIFE_EVENT_LABEL: Record<LifeEventKind, string> = {
  BIRTH: "출산·육아",
  PARENTAL_LEAVE: "육아휴직",
  MOVE: "이사",
  WEDDING: "결혼",
  INCOME_CHANGE: "이직·소득 변화",
  OTHER: "기타",
};

/** 종류마다 입력 창에 먼저 채워 두는 방향 — 줄어드는 일이 대부분이라 기본은 "줄어요" */
export const LIFE_EVENT_HINT: Record<LifeEventKind, string> = {
  BIRTH: "양육비만큼 매달 저축이 줄어요. 출산 비용은 한 번에 나가는 돈으로.",
  PARENTAL_LEAVE: "휴직 기간 동안 줄어드는 소득만큼 매달 저축이 줄어요.",
  MOVE: "이사 비용·보증금 차이는 한 번에 나가는 돈, 월세·대출 이자 변화는 매달로.",
  WEDDING: "예식·신혼 비용은 한 번에 나가는 돈으로.",
  INCOME_CHANGE: "오르면 매달 저축이 늘어요, 내리면 줄어요.",
  OTHER: "",
};

export interface LifeEventInput {
  id: string;
  kind: LifeEventKind;
  label: string;
  /** 시작 달 */
  startMonth: MonthKey;
  /** 매달 저축 변화 (음수 = 줄어듦) */
  monthly: number;
  /** 매달 변화가 이어지는 개월 수. null = 계속 */
  months: number | null;
  /** 시작 달에 한 번 나가는 돈 (양수) */
  oneTime: number;
}

/** today 가 속한 달에서 n 개월 뒤의 달 */
export function monthAfter(today: DateStr, n: number): MonthKey {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}` as MonthKey;
}

const monthIndex = (k: MonthKey) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;

/** 그 달 저축 변화 = 진행 중인 매달 변화 합 − 그 달 시작하는 일의 한 번 나가는 돈 */
export function savingDeltaIn(events: LifeEventInput[], month: MonthKey): number {
  const at = monthIndex(month);
  let delta = 0;
  for (const e of events) {
    const start = monthIndex(e.startMonth);
    if (at === start) delta -= e.oneTime;
    if (at >= start && (e.months === null || at < start + e.months)) delta += e.monthly;
  }
  return delta;
}

export interface EventProjection {
  /** 목표에 닿는 개월 수 (오늘부터). horizon 안에 못 닿으면 null */
  months: number | null;
  /** 0..horizon 개월 예상 잔액 */
  path: number[];
}

/**
 * 매달 (잔액 × (1+월수익률) + 매달 저축 + 그 달 변화)로 굴린다. 변화로 저축이 마이너스가 되면 모은 돈에서 빠진다.
 * 1개월 뒤 = 다음 달 (만약에 그래프와 같은 기준).
 */
export function projectWithEvents(input: {
  current: number;
  monthly: number;
  annualReturn: number;
  events: LifeEventInput[];
  today: DateStr;
  target: number;
  targetIsReal: boolean;
  inflation: number;
  horizon?: number;
}): EventProjection {
  const horizon = input.horizon ?? 600;
  const r = toMonthlyRate(input.annualReturn);
  const path = [input.current];
  let balance = input.current;
  let reached: number | null = balance >= input.target ? 0 : null;
  for (let m = 1; m <= horizon; m++) {
    balance = balance * (1 + r) + input.monthly + savingDeltaIn(input.events, monthAfter(input.today, m));
    path.push(balance);
    const target = input.targetIsReal ? inflate(input.target, m, input.inflation) : input.target;
    if (reached === null && balance >= target) reached = m;
  }
  return { months: reached, path };
}
