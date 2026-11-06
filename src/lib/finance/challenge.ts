import { formatCompactKRW } from "./money";
import { findRule, merchantKey } from "./merchant-rules";

/**
 * 이번 달 챌린지 — 결산 제안 "같은 사용처 N번"을 "이번 달 절반까지"로 바꿔 홈에서 진행을 보여 준다.
 * 실패해도 지난달보다 줄었으면 그만큼 칭찬한다.
 */

/** 지난달 횟수의 절반 (올림) */
export function challengeLimit(baselineCount: number): number {
  return Math.max(1, Math.ceil(baselineCount / 2));
}

/** 같은 사용처 방문 횟수 — 지점 이름이 달라도 같은 가게로 센다 (스타벅스 → 스타벅스강남점) */
export function countVisits(merchants: readonly (string | null)[], merchant: string): number {
  const rule = [{ merchantKey: merchantKey(merchant), merchant, categoryId: "" }];
  return merchants.filter((m) => !!m && findRule(m, rule) !== null).length;
}

export interface ChallengeResult {
  text: string;
  tone: "good" | "neutral";
}

/** 지난 챌린지 결과 한 줄 (결산 카드) */
export function describeChallengeResult(c: { merchant: string; limitCount: number; baselineCount: number; baselineAmount: bigint; actual: number }): ChallengeResult {
  const fewer = c.baselineCount - c.actual;
  const perVisit = c.baselineCount > 0 ? c.baselineAmount / BigInt(c.baselineCount) : 0n;
  const saved = fewer > 0 && perVisit > 0n ? ` · 약 ${formatCompactKRW(perVisit * BigInt(fewer))} 아꼈어요` : "";
  if (c.actual <= c.limitCount) return { text: `${c.merchant} ${c.limitCount}번까지 — ${c.actual}번으로 지켰어요${saved}`, tone: "good" };
  if (fewer > 0) return { text: `${c.merchant} ${c.baselineCount}번 → ${c.actual}번으로 줄었어요${saved}`, tone: "good" };
  return { text: `${c.merchant} ${c.actual}번 — 이번엔 어려웠어요. 목표를 조금 덜 줄여 다시 해 봐요`, tone: "neutral" };
}
