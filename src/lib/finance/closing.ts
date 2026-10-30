import { formatCompactKRW } from "./money";

/**
 * 월간 결산 — 다음 달 조정 제안 (PROD.MD §4-7). 규칙 기반, 최대 3개.
 * 1) 쓸 수 있는 돈을 초과했으면 전월 대비 가장 많이 늘어난 지출 카테고리 (전월 기록이 없으면 가장 많이 쓴 카테고리)
 * 2) 목표 저축을 2개월 연속 못 채웠으면 대표 목표 조정 ("만약에"로 이동)
 * 3) 잔액 입력이 30일 넘은 자산 계좌가 있으면 잔액 업데이트
 */

export interface ClosingSuggestion {
  kind: "category" | "goal" | "balance";
  text: string;
  href: string;
}

export const MAX_SUGGESTIONS = 3;

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
}): ClosingSuggestion[] {
  const out: ClosingSuggestion[] = [];

  if (input.overspent) {
    const top = input.categoryDiffs.filter((c) => c.diff > 0n).sort((a, b) => (b.diff > a.diff ? 1 : b.diff < a.diff ? -1 : 0))[0];
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

  if (input.primaryGoal && input.savingShort[0] && input.savingShort[1]) {
    out.push({
      kind: "goal",
      text: `목표 저축을 2개월 연속 못 채웠어요. ${input.primaryGoal.name}의 기간이나 금액을 조정해 보세요.`,
      href: `/goals/${input.primaryGoal.id}#what-if`,
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

  return out.slice(0, MAX_SUGGESTIONS);
}

/** 대표 목표 앞섬(+)·뒤처짐(−) 개월의 전월 대비 변화 문구 */
export function describeAheadChange(ahead: number | null, prevAhead: number | null): string | null {
  if (ahead === null) return "지금 납입액으로는 달성이 어려워요";
  const now = ahead >= 0 ? `${ahead}개월 앞섬` : `${-ahead}개월 뒤처짐`;
  if (prevAhead === null) return now;
  const diff = ahead - prevAhead;
  if (diff === 0) return `${now} (전월과 같음)`;
  return `${now} (전월보다 ${Math.abs(diff)}개월 ${diff > 0 ? "당김" : "밀림"})`;
}
