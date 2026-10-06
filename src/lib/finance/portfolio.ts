/**
 * 모델 포트폴리오 (PROD.MD §3-3). MVP에서는 시뮬레이터·목표의 기대수익률 프리셋으로만 쓴다.
 * 수익률·변동성은 설계용 초기값 — 서비스 전 출처 있는 가정치로 교체 (AssetClassAssumption 테이블).
 */

export type RiskProfileKey = "STABLE" | "STABLE_SEEKING" | "NEUTRAL" | "ACTIVE" | "AGGRESSIVE";

export interface AssetClass {
  id: string;
  label: string;
  expectedReturn: number;
  volatility: number;
}

export const DEFAULT_ASSET_CLASSES: AssetClass[] = [
  { id: "CASH", label: "현금성·예적금", expectedReturn: 0.03, volatility: 0.005 },
  { id: "KR_BOND", label: "국내 채권", expectedReturn: 0.035, volatility: 0.04 },
  { id: "GLOBAL_BOND", label: "해외 채권(환헤지)", expectedReturn: 0.04, volatility: 0.05 },
  { id: "KR_EQUITY", label: "국내 주식 지수", expectedReturn: 0.06, volatility: 0.18 },
  { id: "US_EQUITY", label: "해외(미국) 주식 지수", expectedReturn: 0.075, volatility: 0.16 },
  { id: "DIVIDEND", label: "배당·인컴 주식", expectedReturn: 0.065, volatility: 0.14 },
  { id: "REITS", label: "리츠(REITs)", expectedReturn: 0.055, volatility: 0.18 },
  { id: "GOLD", label: "금·원자재", expectedReturn: 0.04, volatility: 0.15 },
];

export const RISK_PROFILE_LABEL: Record<RiskProfileKey, string> = {
  STABLE: "안정형",
  STABLE_SEEKING: "안정추구형",
  NEUTRAL: "위험중립형",
  ACTIVE: "적극투자형",
  AGGRESSIVE: "공격투자형",
};

/** 자산군 비중(%) — 합계 100 */
export const MODEL_ALLOCATIONS: Record<RiskProfileKey, Record<string, number>> = {
  STABLE: { CASH: 60, KR_BOND: 25, GLOBAL_BOND: 10, KR_EQUITY: 0, US_EQUITY: 5, DIVIDEND: 0, REITS: 0, GOLD: 0 },
  STABLE_SEEKING: { CASH: 35, KR_BOND: 25, GLOBAL_BOND: 15, KR_EQUITY: 5, US_EQUITY: 15, DIVIDEND: 5, REITS: 0, GOLD: 0 },
  NEUTRAL: { CASH: 20, KR_BOND: 20, GLOBAL_BOND: 15, KR_EQUITY: 10, US_EQUITY: 25, DIVIDEND: 5, REITS: 5, GOLD: 0 },
  ACTIVE: { CASH: 10, KR_BOND: 10, GLOBAL_BOND: 10, KR_EQUITY: 15, US_EQUITY: 40, DIVIDEND: 10, REITS: 5, GOLD: 0 },
  AGGRESSIVE: { CASH: 5, KR_BOND: 5, GLOBAL_BOND: 5, KR_EQUITY: 15, US_EQUITY: 50, DIVIDEND: 10, REITS: 5, GOLD: 5 },
};

export const RISK_PROFILES: RiskProfileKey[] = ["STABLE", "STABLE_SEEKING", "NEUTRAL", "ACTIVE", "AGGRESSIVE"];

/**
 * 기대수익률 = Σ wᵢμᵢ.
 * 변동성은 상관관계 미반영(완전 상관 가정) 상한값 Σ wᵢσᵢ — 보수적으로 크게 잡힌다. 상관행렬은 P1에서 도입.
 */
export function portfolioMetrics(
  allocation: Record<string, number>,
  classes: AssetClass[] = DEFAULT_ASSET_CLASSES,
): { expectedReturn: number; volatility: number } {
  const total = Object.values(allocation).reduce((a, b) => a + b, 0);
  if (total <= 0) return { expectedReturn: 0, volatility: 0 };
  let expectedReturn = 0;
  let volatility = 0;
  for (const c of classes) {
    const w = (allocation[c.id] ?? 0) / total;
    expectedReturn += w * c.expectedReturn;
    volatility += w * c.volatility;
  }
  return { expectedReturn, volatility };
}

export function profileReturn(profile: RiskProfileKey): number {
  return portfolioMetrics(MODEL_ALLOCATIONS[profile]).expectedReturn;
}

export function nextProfile(profile: RiskProfileKey): RiskProfileKey | null {
  const i = RISK_PROFILES.indexOf(profile);
  return i >= 0 && i < RISK_PROFILES.length - 1 ? RISK_PROFILES[i + 1] : null;
}
