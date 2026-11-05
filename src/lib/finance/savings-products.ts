/**
 * 정책형 적금 — 비과세 + 정부기여금.
 * 정책 수치가 바뀌면 이 파일만 고친다. 수치는 가입 안내 기준 추정값이라, 실제 기여금은 은행 앱의 적립 내역이 정확하다.
 *
 * 기여금(월) = min(월 납입, cap) × rate + (min(월 납입, monthlyMax) − cap)⁺ × extraRate
 * 기여금 자체에 붙는 이자는 계산하지 않는다 (작아서 무시).
 */

export type SavingsProductKey = "YOUTH_LEAP" | "YOUTH_FUTURE";

export interface SavingsTier {
  key: string;
  label: string;
  /** 매칭 한도까지의 기여금 비율 (0.06 = 6%) */
  rate: number;
  /** 기본 매칭 한도 (월, 원) */
  cap: number;
  /** 한도 초과 ~ 월 납입 한도 구간의 기여금 비율 */
  extraRate: number;
}

export interface SavingsProduct {
  label: string;
  /** 만기 (개월) */
  termMonths: number;
  /** 월 납입 한도 (원) */
  monthlyMax: number;
  /** 이자 비과세 */
  taxFree: boolean;
  tiers: SavingsTier[];
  hint: string;
}

export const SAVINGS_PRODUCTS: Record<SavingsProductKey, SavingsProduct> = {
  // 출처: 서민금융진흥원 청년도약계좌 상품 안내 (fill4young.kinfa.or.kr/yla/main, 2026-11-05 확인)
  // '25.1월 납입분부터의 구조. 그 전 납입분은 구간Ⅱ(초과분 3%)가 없었고, 재가입자는 조정비율이 붙어 실제보다 조금 많게 보일 수 있다.
  YOUTH_LEAP: {
    label: "청년도약계좌",
    termMonths: 60,
    monthlyMax: 700_000,
    taxFree: true,
    tiers: [
      { key: "2400", label: "총급여 2,400만원 이하 (종합소득 1,600만원 이하)", rate: 0.06, cap: 400_000, extraRate: 0.03 },
      { key: "3600", label: "총급여 3,600만원 이하 (종합소득 2,600만원 이하)", rate: 0.046, cap: 500_000, extraRate: 0.03 },
      { key: "4800", label: "총급여 4,800만원 이하 (종합소득 3,600만원 이하)", rate: 0.037, cap: 600_000, extraRate: 0.03 },
      { key: "6000", label: "총급여 6,000만원 이하 (종합소득 4,800만원 이하)", rate: 0.03, cap: 700_000, extraRate: 0 },
      { key: "7500", label: "총급여 7,500만원 이하 (종합소득 6,300만원 이하, 기여금 없음)", rate: 0, cap: 0, extraRate: 0 },
    ],
    hint: "5년 만기 · 월 70만원까지 · 이자 비과세 · 기여금 월 최대 3만 3천원 (신규 가입은 2025년 말 종료).",
  },
  // 출처: 서민금융진흥원 청년미래적금 안내 (kinfa.or.kr/financialProduct/youthFutureSavings.do, 2026-11-05 확인)
  // 구간 판정은 소득 + 가구 중위소득(일반 200%·우대 150% 이하)을 함께 본다 — 여기서는 사용자가 고른 구간을 그대로 쓴다.
  YOUTH_FUTURE: {
    label: "청년미래적금",
    termMonths: 36,
    monthlyMax: 500_000,
    taxFree: true,
    tiers: [
      { key: "BASIC", label: "일반형 6% (총급여 6,000만원 이하 · 소상공인 연매출 3억원 이하)", rate: 0.06, cap: 500_000, extraRate: 0 },
      { key: "PREFERRED", label: "우대형 12% (중소기업 신규·재직 총급여 3,600만원 이하 · 소상공인 연매출 1억원 이하)", rate: 0.12, cap: 500_000, extraRate: 0 },
      { key: "NONE", label: "총급여 7,500만원 이하 (기여금 없음, 비과세만)", rate: 0, cap: 0, extraRate: 0 },
    ],
    hint: "3년 만기 · 월 50만원(연 600만원)까지 · 이자 비과세 · 기여금 일반형 6%, 우대형 12%.",
  },
};

export const SAVINGS_PRODUCT_KEYS = Object.keys(SAVINGS_PRODUCTS) as SavingsProductKey[];

export function isSavingsProduct(v: string | null | undefined): v is SavingsProductKey {
  return !!v && v in SAVINGS_PRODUCTS;
}

/** 상품 + 구간 → 계산 규칙. 모르는 값이면 null (일반 적금) */
export function productRule(product: string | null, tierKey: string | null): { product: SavingsProduct; tier: SavingsTier | null } | null {
  if (!isSavingsProduct(product)) return null;
  const p = SAVINGS_PRODUCTS[product];
  return { product: p, tier: p.tiers.find((t) => t.key === tierKey) ?? null };
}

/** 월 납입액에 대한 월 정부기여금 (원, 내림) */
export function monthlyContribution(tier: SavingsTier, monthlyMax: number, monthly: number): number {
  const base = Math.min(monthly, tier.cap) * tier.rate;
  const extra = Math.max(0, Math.min(monthly, monthlyMax) - tier.cap) * tier.extraRate;
  return Math.floor(base + extra + 1e-6);
}
