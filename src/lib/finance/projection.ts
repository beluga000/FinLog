/**
 * 자산 성장 예측 & 목표 역산 (PROD.MD §4-1, §4-6).
 * - 연 수익률 R → 월 수익률 r = (1+R)^(1/12) − 1 (단순 R/12 아님)
 * - 납입은 매월 말 (기말 납입)
 * - 금액 입력/출력은 원 단위 number. 내부 계산은 float64, 출력 시 원 단위 반올림.
 *   (10억 단위에서도 float64 유효숫자 15자리 → 원 단위 오차 없음)
 */

export function toMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** 실질 수익률 (1+R)/(1+π) − 1 */
export function realRate(annualRate: number, inflation: number): number {
  return (1 + annualRate) / (1 + inflation) - 1;
}

/** 경과 개월 수만큼 물가로 할인한 오늘 가치 */
export function deflate(amount: number, months: number, inflation: number): number {
  return amount / Math.pow(1 + inflation, months / 12);
}

export function inflate(amount: number, months: number, inflation: number): number {
  return amount * Math.pow(1 + inflation, months / 12);
}

/** 닫힌 식 미래가치: FV = PV(1+r)^n + PMT·((1+r)^n − 1)/r */
export function futureValue(pv: number, pmt: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return pv + pmt * months;
  const g = Math.pow(1 + monthlyRate, months);
  return pv * g + pmt * ((g - 1) / monthlyRate);
}

export interface GrowthInput {
  pv: number;
  pmt: number;
  annualReturn: number;
  years: number;
  /** 기대 물가상승률 (기본 2.5%) */
  inflation?: number;
  /** 월 납입액 연 증가율 (기본 0%) */
  pmtGrowth?: number;
}

export interface GrowthPoint {
  year: number;
  /** 누적 납입 원금 (현재 자산 포함) */
  contributed: number;
  balance: number;
  /** 오늘 가치로 환산 */
  balanceReal: number;
  gain: number;
}

export interface GrowthResult {
  points: GrowthPoint[];
  finalBalance: number;
  finalBalanceReal: number;
  totalContributed: number;
  totalGain: number;
  /** (최종 − 원금) / 원금 */
  cumulativeReturn: number | null;
}

export function predictAssetGrowth(input: GrowthInput): GrowthResult {
  const { pv, annualReturn } = input;
  const years = Math.max(0, Math.round(input.years));
  const inflation = input.inflation ?? 0.025;
  const pmtGrowth = input.pmtGrowth ?? 0;
  const r = toMonthlyRate(annualReturn);

  let balance = pv;
  let contributed = pv;
  let pmt = input.pmt;
  const points: GrowthPoint[] = [{ year: 0, contributed: pv, balance: pv, balanceReal: pv, gain: 0 }];

  for (let year = 1; year <= years; year++) {
    for (let month = 0; month < 12; month++) {
      balance = balance * (1 + r) + pmt;
      contributed += pmt;
    }
    pmt = pmt * (1 + pmtGrowth);
    const rounded = Math.round(balance);
    points.push({
      year,
      contributed: Math.round(contributed),
      balance: rounded,
      balanceReal: Math.round(deflate(balance, year * 12, inflation)),
      gain: Math.round(balance - contributed),
    });
  }

  const last = points[points.length - 1];
  return {
    points,
    finalBalance: last.balance,
    finalBalanceReal: last.balanceReal,
    totalContributed: last.contributed,
    totalGain: last.balance - last.contributed,
    cumulativeReturn: last.contributed > 0 ? (last.balance - last.contributed) / last.contributed : null,
  };
}

export interface RequiredInput {
  target: number;
  pv: number;
  months: number;
  annualReturn: number;
  /** true면 target을 오늘 가치로 보고 목표 시점 명목가로 환산 */
  targetIsReal?: boolean;
  inflation?: number;
}

export interface RequiredResult {
  /** 월 필요 납입액 (원, 올림). 이미 달성 가능하면 0 */
  monthly: number;
  alreadyAchievable: boolean;
  /** 목표 시점 명목 목표액 */
  nominalTarget: number;
  /** 납입 없이 현재 자산만 굴렸을 때 목표 시점 금액 */
  pvFuture: number;
}

/** PMT = (Target − PV·(1+r)^n) · r / ((1+r)^n − 1) */
export function calculateRequiredInvestment(input: RequiredInput): RequiredResult {
  const inflation = input.inflation ?? 0.025;
  const months = Math.max(0, Math.round(input.months));
  const nominalTarget = input.targetIsReal ? inflate(input.target, months, inflation) : input.target;
  const r = toMonthlyRate(input.annualReturn);
  const pvFuture = futureValue(input.pv, 0, r, months);
  const gap = nominalTarget - pvFuture;

  if (gap <= 0) return { monthly: 0, alreadyAchievable: true, nominalTarget, pvFuture };
  if (months === 0) return { monthly: Math.ceil(gap), alreadyAchievable: false, nominalTarget, pvFuture };

  const monthly = r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1);
  return { monthly: Math.ceil(monthly - 1e-6), alreadyAchievable: false, nominalTarget, pvFuture };
}

const MAX_MONTHS = 1200; // 100년

export interface MonthsToGoalInput {
  target: number;
  pv: number;
  pmt: number;
  annualReturn: number;
  targetIsReal?: boolean;
  inflation?: number;
}

/**
 * 현재 납입액을 유지할 때 목표 도달까지 걸리는 개월 수. 100년 내 불가능하면 null.
 * 실질 목표(물가 연동)도 같은 루프로 처리하기 위해 닫힌 식 대신 월 단위 반복을 쓴다.
 */
export function calculateMonthsToGoal(input: MonthsToGoalInput): number | null {
  const inflation = input.inflation ?? 0.025;
  const r = toMonthlyRate(input.annualReturn);
  const targetAt = (m: number) => (input.targetIsReal ? inflate(input.target, m, inflation) : input.target);

  let balance = input.pv;
  if (balance >= targetAt(0)) return 0;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    balance = balance * (1 + r) + input.pmt;
    if (balance >= targetAt(m) - 0.5) return m;
  }
  return null;
}

export interface AlternativesInput extends RequiredInput {
  /** 현재 월 저축 가능액 (최근 평균 저축액 등) */
  capacity: number;
  /** 더 공격적인 포트폴리오의 기대수익률 */
  higherReturn?: number;
}

export interface Alternatives {
  /** (a) 현재 저축 가능액으로 달성까지 걸리는 총 개월 수 (null = 100년 내 불가) */
  extendToMonths: number | null;
  /** (b) 목표일까지 현재 저축 가능액으로 모을 수 있는 금액 (target 과 같은 기준: 실질/명목) */
  reachableTarget: number;
  /** (c) 더 높은 수익률 가정 시 월 필요 납입액 */
  higherReturn: { annualReturn: number; monthly: number } | null;
}

export function suggestAlternatives(input: AlternativesInput): Alternatives {
  const inflation = input.inflation ?? 0.025;
  const months = Math.max(0, Math.round(input.months));
  const extendToMonths = calculateMonthsToGoal({
    target: input.target,
    pv: input.pv,
    pmt: input.capacity,
    annualReturn: input.annualReturn,
    targetIsReal: input.targetIsReal,
    inflation,
  });
  const fv = futureValue(input.pv, input.capacity, toMonthlyRate(input.annualReturn), months);
  const reachableTarget = Math.floor((input.targetIsReal ? deflate(fv, months, inflation) : fv) + 1e-6);
  const higherReturn =
    input.higherReturn !== undefined && input.higherReturn > input.annualReturn
      ? {
          annualReturn: input.higherReturn,
          monthly: calculateRequiredInvestment({ ...input, annualReturn: input.higherReturn }).monthly,
        }
      : null;
  return { extendToMonths, reachableTarget, higherReturn };
}
