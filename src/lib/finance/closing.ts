import { GOAL_BLOCKER_TEXT, type GoalPaceKind } from "./goals";
import { formatCompactKRW } from "./money";

/**
 * 월간 결산 — 다음 달 조정 제안 (PROD.MD §4-7). 규칙 기반, 최대 3개.
 * 규칙마다 우선순위가 있어 많이 걸려도 중요한 것부터 3개만 보인다.
 *  10 큰 지출 한 건: 쓸 수 있는 돈을 넘겼고, 고정·정기가 아닌 한 건이 월 지출의 20% 이상
 *  15 남은 돈 옮기기: 쓸 수 있는 돈이 10만 원 이상 남았으면 대표 목표 계좌로 (초과한 달엔 나오지 않음)
 *  20 카테고리: 쓸 수 있는 돈을 넘겼으면 전월 대비 가장 많이 늘어난 지출 카테고리 (전월 기록이 없으면 가장 많이 쓴 곳).
 *     큰 지출 한 건은 이 증감에서 뺀다 — 한 번 산 가전 때문에 "가전을 줄이세요"가 나오지 않게.
 *  30 목표: 목표 저축을 2개월 연속 못 채웠으면 대표 목표 조정 ("만약에"로 이동)
 *  40 사용처 집중: 고정·정기가 아니고 필요(NEEDS) 지출도 아닌 같은 사용처에 한 달 8번 이상 (장보기·병원은 줄이라고 하지 않는다)
 *  50 정기 거래 확인: 결산 달까지 확인 안 한 정기 거래가 남아 있으면
 *  60 잔액: 잔액 입력이 30일 넘은 자산 계좌가 있으면
 */

export type ClosingSuggestionKind = "oneOff" | "surplus" | "category" | "goal" | "merchant" | "review" | "balance";

export interface ClosingSuggestion {
  kind: ClosingSuggestionKind;
  text: string;
  href: string;
}

export const MAX_SUGGESTIONS = 3;
/** 큰 지출 한 건 — 월 지출 대비 비중과 최소 금액 */
export const ONE_OFF_MIN_SHARE = 0.2;
export const ONE_OFF_MIN_AMOUNT = 300_000n;
/** 사용처 집중 — 한 달 방문 횟수 */
export const MERCHANT_MIN_COUNT = 8;
/** 남은 돈 옮기기 — 최소 남은 금액 */
export const SURPLUS_MIN_AMOUNT = 100_000n;

const PRIORITY: Record<ClosingSuggestionKind, number> = {
  oneOff: 10,
  surplus: 15,
  category: 20,
  goal: 30,
  merchant: 40,
  review: 50,
  balance: 60,
};

/** 결산 달 지출 한 건 (내가 내용까지 볼 수 있는 거래만) */
export interface ClosingExpense {
  merchant: string | null;
  /** 상위 카테고리 이름 */
  categoryName: string;
  amount: bigint;
  /** 고정 지출이거나 정기 규칙으로 만든 거래 */
  fixed: boolean;
  /** 카테고리 구분이 필요(NEEDS) — 구분이 없으면 false */
  needs?: boolean;
}

export interface OneOffExpense {
  label: string;
  categoryName: string;
  amount: bigint;
  share: number;
}

/** 고정·정기가 아닌 지출 중 가장 큰 한 건이 월 지출의 20% 이상이고 30만 원 이상이면 반환 */
export function findOneOffExpense(expenses: ClosingExpense[], totalExpense: bigint): OneOffExpense | null {
  if (totalExpense <= 0n) return null;
  const top = expenses.filter((e) => !e.fixed).reduce<ClosingExpense | null>((m, e) => (m === null || e.amount > m.amount ? e : m), null);
  if (!top || top.amount < ONE_OFF_MIN_AMOUNT) return null;
  const share = Number(top.amount) / Number(totalExpense);
  if (share < ONE_OFF_MIN_SHARE) return null;
  return { label: top.merchant?.trim() || top.categoryName, categoryName: top.categoryName, amount: top.amount, share };
}

export interface FrequentMerchant {
  name: string;
  count: number;
  amount: bigint;
}

/** 고정·정기·필요 지출이 아닌 것에서 같은 사용처가 8번 이상이면 가장 자주 간 곳 (같으면 금액 큰 곳). 구분 없는 카테고리는 센다 */
export function findFrequentMerchant(expenses: ClosingExpense[]): FrequentMerchant | null {
  const byName = new Map<string, FrequentMerchant>();
  for (const e of expenses) {
    const name = e.merchant?.trim();
    if (e.fixed || e.needs || !name) continue;
    const m = byName.get(name) ?? { name, count: 0, amount: 0n };
    m.count += 1;
    m.amount += e.amount;
    byName.set(name, m);
  }
  const top = [...byName.values()].sort((a, b) => b.count - a.count || (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))[0];
  return top && top.count >= MERCHANT_MIN_COUNT ? top : null;
}

export function suggestAdjustments(input: {
  overspent: boolean;
  /** 결산 달 vs 그 전달 카테고리별 지출 증감 (전달 기록이 없으면 결산 달 금액 그대로) */
  categoryDiffs: { name: string; diff: bigint }[];
  /** 그 전달 기록이 있어 증감 비교가 가능한지 */
  compared: boolean;
  /** 목표 저축 미달 여부 [결산 전달, 결산 달] */
  savingShort: [boolean, boolean];
  primaryGoal: { id: string; name: string } | null;
  staleAccounts: { name: string }[];
  ledgerHref: string;
  oneOff?: OneOffExpense | null;
  frequentMerchant?: FrequentMerchant | null;
  /** 결산 달까지 확인 안 한 정기 거래 수 */
  pendingReviews?: number;
  /** 쓸 수 있는 돈에서 남긴 금액. goal = 옮길 대표 목표 (연결 계좌가 있을 때), monthsSooner = 옮기면 당겨지는 개월 */
  surplus?: { amount: bigint; goal: { id: string; name: string; monthsSooner: number | null } | null } | null;
}): ClosingSuggestion[] {
  const out: ClosingSuggestion[] = [];
  const oneOff = input.overspent ? input.oneOff ?? null : null;

  if (oneOff) {
    out.push({
      kind: "oneOff",
      text: `${oneOff.label} ${formatCompactKRW(oneOff.amount)} 한 건이 지난달 지출의 ${Math.round(oneOff.share * 100)}%예요. 한 번뿐인 지출이면 이번 달은 평소대로 가도 돼요.`,
      href: input.ledgerHref,
    });
  }

  if (input.overspent) {
    const diffs = input.categoryDiffs.map((c) =>
      oneOff && c.name === oneOff.categoryName ? { ...c, diff: c.diff - oneOff.amount } : c,
    );
    const top = diffs.filter((c) => c.diff > 0n).sort((a, b) => (b.diff > a.diff ? 1 : b.diff < a.diff ? -1 : 0))[0];
    if (top) {
      out.push({
        kind: "category",
        text: input.compared
          ? `${top.name} +${formatCompactKRW(top.diff)} — 지난달 가장 많이 늘었어요. 이번 달엔 줄여 보세요.`
          : `${top.name} ${formatCompactKRW(top.diff)} — 지난달 가장 많이 쓴 곳이에요. 이번 달엔 줄여 보세요.`,
        href: input.ledgerHref,
      });
    }
  }

  const surplus = input.surplus;
  if (!input.overspent && surplus && surplus.amount >= SURPLUS_MIN_AMOUNT) {
    const left = `지난달 ${formatCompactKRW(surplus.amount)} 남겼어요.`;
    const goal = surplus.goal;
    out.push(
      goal
        ? {
            kind: "surplus",
            text: goal.monthsSooner
              ? `${left} ${goal.name} 계좌로 옮기면 목표가 ${goal.monthsSooner}개월 당겨져요.`
              : `${left} ${goal.name} 계좌로 옮겨 두면 목표에 보탬이 돼요.`,
            href: `/goals/${goal.id}`,
          }
        : {
            kind: "surplus",
            text: `${left} 저축 계좌로 옮겨 두면 이번 달 생활비와 섞이지 않아요.`,
            href: "/assets",
          },
    );
  }

  if (input.primaryGoal && input.savingShort[0] && input.savingShort[1]) {
    out.push({
      kind: "goal",
      text: `목표 저축을 2개월 연속 못 채웠어요. ${input.primaryGoal.name}의 기간이나 금액을 조정해 보세요.`,
      href: `/goals/${input.primaryGoal.id}#what-if`,
    });
  }

  const merchant = input.frequentMerchant;
  if (merchant) {
    out.push({
      kind: "merchant",
      text: `${merchant.name} ${merchant.count}번, ${formatCompactKRW(merchant.amount)} — 횟수를 절반으로 줄이면 한 달 ${formatCompactKRW(merchant.amount / 2n)} 아껴요.`,
      href: input.ledgerHref,
    });
  }

  if (input.pendingReviews) {
    out.push({
      kind: "review",
      text: `확인 안 한 정기 거래 ${input.pendingReviews}건이 있어요. 확인해야 결산이 정확해져요.`,
      href: "/dashboard",
    });
  }

  if (input.staleAccounts.length) {
    const [first, ...rest] = input.staleAccounts;
    out.push({
      kind: "balance",
      text: `${first.name}${rest.length ? ` 외 ${rest.length}개` : ""} 잔액을 업데이트하면 목표 진척이 정확해져요.`,
      href: "/assets",
    });
  }

  return out.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, MAX_SUGGESTIONS);
}

export interface ClosingPace {
  /** 결산 달 말일 기준 상태 — 목표 화면과 같은 말 (원인·모자란 금액) */
  text: string;
  tone: "good" | "warning" | "critical";
  /** 그 전달 말일 대비 변화와 이유 — 비교할 수 없으면 null */
  change: string | null;
}

/**
 * 결산 카드의 대표 목표 한 줄 — "N개월 뒤처짐" 대신 목표 화면처럼 원인·모자란 금액으로 말하고,
 * 전월 대비 변화는 개월 수와 함께 이유(목표 저축을 덜 함)를 붙인다.
 * savingGap = 결산 달 계획 저축 − 실제 저축 (0 이하면 다 채움).
 */
export function describeClosingPace(input: {
  pace: GoalPaceKind;
  ahead: number | null;
  prevAhead: number | null;
  savingGap: bigint;
}): ClosingPace {
  const { pace, ahead, prevAhead, savingGap } = input;
  let text: string;
  let tone: ClosingPace["tone"] = "warning";
  switch (pace.kind) {
    case "achieved":
      text = "달성 완료";
      tone = "good";
      break;
    case "paused":
      text = "일시정지";
      tone = "good";
      break;
    case "ready":
      text = "모인 돈만으로 닿아요";
      tone = "good";
      break;
    case "onTrack":
      text = pace.aheadMonths === 0 ? "계획대로면 목표일에 달성" : `계획대로면 ${pace.aheadMonths}개월 먼저 달성`;
      tone = "good";
      break;
    case "blocked":
      text = GOAL_BLOCKER_TEXT[pace.by];
      break;
    case "short":
      text = `월 ${formatCompactKRW(pace.gap)} 모자라요`;
      break;
    case "stuck":
      text = "지금 배분으로는 닿기 어려워요";
      tone = "critical";
      break;
  }

  let change: string | null = null;
  if (ahead !== null && prevAhead !== null && pace.kind !== "achieved" && pace.kind !== "paused") {
    const diff = ahead - prevAhead;
    if (diff > 0) change = `전월보다 ${diff}개월 당겨졌어요`;
    else if (diff < 0 && savingGap > 0n) change = `목표 저축을 ${formatCompactKRW(savingGap)} 덜 해서 ${-diff}개월 밀렸어요`;
    else if (diff < 0) change = `전월보다 ${-diff}개월 밀렸어요`;
    else change = "전월과 같아요";
  }
  return { text, tone, change };
}

export interface ClosingDriver {
  kind: "oneOff" | "category";
  name: string;
  /** 결산 달 금액 (큰 지출 한 건은 그 금액) */
  amount: bigint;
  /** 전월 대비 증감 — 비교할 수 없거나 큰 지출 한 건이면 null */
  diff: bigint | null;
}

export const MAX_DRIVERS = 3;

/**
 * 결산 "무엇 때문인지 보기" — 쓸 수 있는 돈을 넘긴(남긴) 이유가 된 지출.
 * 큰 지출 한 건이 있으면 먼저 따로 보이고 그 금액은 카테고리 증감에서 뺀다 (조정 제안과 같은 기준).
 * 넘긴 달은 많이 늘어난 곳, 남긴 달은 많이 줄인 곳부터. 그쪽이 하나도 없으면 증감이 큰 곳부터.
 * 전월 기록이 없으면 많이 쓴 곳부터.
 */
export function explainSpendableResult(input: {
  overspent: boolean;
  current: { name: string; amount: bigint }[];
  previous: { name: string; amount: bigint }[];
  compared: boolean;
  oneOff?: OneOffExpense | null;
}): ClosingDriver[] {
  const out: ClosingDriver[] = [];
  const oneOff = input.oneOff ?? null;
  if (oneOff) out.push({ kind: "oneOff", name: oneOff.label, amount: oneOff.amount, diff: null });
  const cmp = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);
  const abs = (v: bigint) => (v < 0n ? -v : v);

  if (!input.compared) {
    for (const c of [...input.current].sort((a, b) => cmp(a.amount, b.amount))) {
      if (out.length >= MAX_DRIVERS) break;
      if (c.amount > 0n) out.push({ kind: "category", name: c.name, amount: c.amount, diff: null });
    }
    return out;
  }

  const prev = new Map(input.previous.map((c) => [c.name, c.amount]));
  const names = new Set([...input.current.map((c) => c.name), ...prev.keys()]);
  const cur = new Map(input.current.map((c) => [c.name, c.amount]));
  const rows = [...names].map((name) => {
    const amount = cur.get(name) ?? 0n;
    let diff = amount - (prev.get(name) ?? 0n);
    if (oneOff && name === oneOff.categoryName) diff -= oneOff.amount;
    return { name, amount, diff };
  });
  const wanted = rows.filter((r) => (input.overspent ? r.diff > 0n : r.diff < 0n));
  const pick = wanted.length
    ? wanted.sort((a, b) => cmp(abs(a.diff), abs(b.diff)))
    : rows.filter((r) => r.diff !== 0n).sort((a, b) => cmp(abs(a.diff), abs(b.diff)));
  for (const r of pick) {
    if (out.length >= MAX_DRIVERS) break;
    out.push({ kind: "category", name: r.name, amount: r.amount, diff: r.diff });
  }
  return out;
}
