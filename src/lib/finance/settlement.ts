/**
 * 부부 정산 (PROD.MD Phase 2 "정산") — 한 달 동안 각자 낸 공동 지출을 나누는 방식대로 맞춘다.
 *
 * 공동 지출 = 그 달의 지출 중 비공개가 아닌 것 (공개·합계만 공개). 비공개는 각자 용돈으로 본다.
 * 낸 사람 = 결제 계좌(카드 포함)의 명의자. 공동 명의 계좌로 낸 것은 이미 함께 낸 돈이라 정산에서 뺀다.
 *           계좌 없이 기록한 것(현금 등)은 기록한 사람.
 * 나누는 방식: EQUAL 반반 · INCOME_RATIO 그 달 수입 비율(공개 수입만, 둘 다 0이면 반반) · CUSTOM 직접 정한 비율.
 * 금액은 원 단위 BigInt, 비율은 만분율(정수)로 계산한다 — 두 사람 몫의 합이 공동 지출과 정확히 같다.
 */

export type SplitMethodKey = "EQUAL" | "INCOME_RATIO" | "CUSTOM";

export const SPLIT_METHOD_LABEL: Record<SplitMethodKey, string> = {
  EQUAL: "반반",
  INCOME_RATIO: "수입 비율",
  CUSTOM: "직접 정한 비율",
};

export interface SettleExpense {
  amount: bigint;
  /** 낸 사람. null = 공동 명의 계좌 */
  payerId: string | null;
}

export interface SettleInput {
  /** 두 사람 [a, b] */
  members: [string, string];
  expenses: SettleExpense[];
  method: SplitMethodKey;
  /** CUSTOM: a 의 몫(%) 0~100 */
  customPercentA?: number | null;
  /** INCOME_RATIO: 그 달 각자 수입 */
  incomes?: Record<string, bigint>;
}

export interface SettleResult {
  /** 정산 대상 공동 지출 (공동 명의 계좌 결제 제외) */
  total: bigint;
  /** 공동 명의 계좌로 낸 지출 — 참고용 */
  jointPaid: bigint;
  paid: Record<string, bigint>;
  share: Record<string, bigint>;
  /** a 의 몫 (만분율) */
  basisPointsA: number;
  /** 수입 비율을 골랐지만 수입 기록이 없어 반반으로 계산함 */
  incomeFallback: boolean;
  /** 보낼 돈. null = 맞출 것 없음 */
  transfer: { from: string; to: string; amount: bigint } | null;
}

const BP = 10_000n;

/** total × bp / 10000, 반올림 */
function portion(total: bigint, bp: number): bigint {
  return (total * BigInt(bp) * 2n + BP) / (BP * 2n);
}

export function computeSettlement(input: SettleInput): SettleResult {
  const [a, b] = input.members;
  const paid: Record<string, bigint> = { [a]: 0n, [b]: 0n };
  let jointPaid = 0n;
  for (const e of input.expenses) {
    if (e.payerId === a || e.payerId === b) paid[e.payerId] += e.amount;
    else jointPaid += e.amount;
  }
  const total = paid[a] + paid[b];

  let bp = 5000;
  let incomeFallback = false;
  if (input.method === "CUSTOM" && input.customPercentA != null) {
    bp = Math.round(Math.min(100, Math.max(0, input.customPercentA)) * 100);
  } else if (input.method === "INCOME_RATIO") {
    const ia = input.incomes?.[a] ?? 0n;
    const ib = input.incomes?.[b] ?? 0n;
    if (ia + ib > 0n) bp = Number((ia * BP * 2n + (ia + ib)) / ((ia + ib) * 2n));
    else incomeFallback = true;
  }

  const shareA = portion(total, bp);
  const share = { [a]: shareA, [b]: total - shareA };
  const balanceA = paid[a] - shareA; // 양수 = a 가 더 냈다 → b 가 a 에게
  const transfer =
    balanceA > 0n ? { from: b, to: a, amount: balanceA } : balanceA < 0n ? { from: a, to: b, amount: -balanceA } : null;
  return { total, jointPaid, paid, share, basisPointsA: bp, incomeFallback, transfer };
}
