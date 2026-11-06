import type { AccountType } from "./types";

/**
 * 세제 혜택 계좌 — 올해 넣은 돈과 한도, 남은 한도를 채웠을 때 돌려받는 세액(참고용 계산).
 * 상품을 권하지 않고 계좌 종류별 연간 한도만 계산한다 (PROD.MD ③ 규제 원칙).
 * 한도·공제율이 바뀌면 TAX_YEAR_RULES 에 그 해 줄을 추가한다. 코드 다른 곳에 수치를 쓰지 않는다.
 */

export type TaxWrapper = "PENSION_SAVINGS" | "IRP" | "ISA";

export const TAX_WRAPPER_LABEL: Record<TaxWrapper, string> = {
  PENSION_SAVINGS: "연금저축",
  IRP: "IRP",
  ISA: "ISA",
};

export function isTaxWrapper(v: unknown): v is TaxWrapper {
  return v === "PENSION_SAVINGS" || v === "IRP" || v === "ISA";
}

/** 계좌 종류별로 고를 수 있는 세제 혜택 — 연금 계좌는 연금저축·IRP, 투자·예적금 계좌는 ISA */
export function taxWrappersFor(type: AccountType): TaxWrapper[] {
  if (type === "PENSION") return ["PENSION_SAVINGS", "IRP"];
  if (type === "INVESTMENT" || type === "SAVINGS") return ["ISA"];
  return [];
}

export interface TaxYearRule {
  year: number;
  /** 연금저축 세액공제 대상 한도 */
  pensionSavingsCap: number;
  /** 연금저축 + IRP 합산 세액공제 대상 한도 */
  pensionTotalCap: number;
  /** 총급여 highRateMaxSalary 이하 공제율 (지방소득세 포함) */
  creditRateHigh: number;
  /** 그 초과 공제율 (지방소득세 포함) */
  creditRateLow: number;
  highRateMaxSalary: number;
  /** ISA 연간 납입 한도 (못 채운 한도의 이월은 계산하지 않는다) */
  isaAnnualCap: number;
  /** 값 확인 출처·날짜 */
  source: string;
}

export const TAX_YEAR_RULES: TaxYearRule[] = [
  {
    year: 2026,
    pensionSavingsCap: 6_000_000,
    pensionTotalCap: 9_000_000,
    creditRateHigh: 0.165,
    creditRateLow: 0.132,
    highRateMaxSalary: 55_000_000,
    isaAnnualCap: 20_000_000,
    // 2023년 귀속부터 적용된 소득세법 제59조의3 기준.
    // ISA: 2024년 정부안(연 4천만·총 2억)은 국회에서 처리되지 않아 연 2천만 유지. 2026년 정부안(생산적금융 ISA 신설)은 국회 심사 중 — 통과되면 다음 해 줄에 반영.
    source: "소득세법 제59조의3·조세특례제한법 제91조의18 기준, 2026-11-06 확인 (언론·금융사 자료 대조, 국세청 원문은 연말정산 공지로 재확인)",
  },
];

/** 그 해 규칙 — 없으면 가장 가까운 이전 해 규칙을 쓰고 assumed=true */
export function taxRuleFor(year: number): { rule: TaxYearRule; assumed: boolean } {
  const exact = TAX_YEAR_RULES.find((r) => r.year === year);
  if (exact) return { rule: exact, assumed: false };
  const sorted = [...TAX_YEAR_RULES].sort((a, b) => b.year - a.year);
  return { rule: sorted.find((r) => r.year < year) ?? sorted[sorted.length - 1], assumed: true };
}

export interface PensionRoom {
  /** 올해 넣은 돈 */
  savings: number;
  irp: number;
  /** 세액공제 대상으로 인정되는 금액 */
  credited: number;
  /** 남은 공제 한도 */
  room: number;
  /** 연금저축은 이미 한도를 채워 남은 한도는 IRP 로만 채울 수 있다 */
  irpOnly: boolean;
  /** 남은 한도를 채우면 돌려받는 세액 [낮은 공제율, 높은 공제율] */
  roomRefund: [number, number];
  /** 이미 넣은 돈으로 돌려받는 세액 [낮은, 높은] */
  creditedRefund: [number, number];
}

export interface IsaRoom {
  paid: number;
  room: number;
}

/**
 * 한 사람의 올해 남은 한도. 한도는 사람마다 따로라 명의별로 부른다.
 * hasPension/hasIsa: 그 계좌가 하나라도 있는지 — 없으면 해당 줄은 null.
 */
export function summarizeTaxRoom(
  paid: { wrapper: TaxWrapper; amount: number }[],
  rule: TaxYearRule,
  has: { pension: boolean; isa: boolean },
): { pension: PensionRoom | null; isa: IsaRoom | null } {
  const sum = (w: TaxWrapper) => paid.filter((p) => p.wrapper === w).reduce((s, p) => s + Math.max(0, p.amount), 0);
  const refund = (v: number): [number, number] => [Math.round(v * rule.creditRateLow), Math.round(v * rule.creditRateHigh)];

  let pension: PensionRoom | null = null;
  if (has.pension) {
    const savings = sum("PENSION_SAVINGS");
    const irp = sum("IRP");
    const credited = Math.min(rule.pensionTotalCap, Math.min(savings, rule.pensionSavingsCap) + irp);
    const room = rule.pensionTotalCap - credited;
    pension = {
      savings,
      irp,
      credited,
      room,
      irpOnly: room > 0 && savings >= rule.pensionSavingsCap,
      roomRefund: refund(room),
      creditedRefund: refund(credited),
    };
  }
  const isa = has.isa ? { paid: sum("ISA"), room: Math.max(0, rule.isaAnnualCap - sum("ISA")) } : null;
  return { pension, isa };
}

/** 총급여 구간 — 연금 세액공제율이 갈린다. null = 모름 (두 공제율로 범위를 보여 준다) */
export type SalaryBand = "UNDER" | "OVER";

export function isSalaryBand(v: unknown): v is SalaryBand {
  return v === "UNDER" || v === "OVER";
}

/** 돌려받는 세액 [낮은, 높은] 중 구간에 맞는 값 — 모르면 null (범위로 보여 준다) */
export function refundForBand(range: [number, number], band: SalaryBand | null): number | null {
  if (band === "UNDER") return range[1];
  if (band === "OVER") return range[0];
  return null;
}

/** 연말 연금 세액공제 알림을 띄우는 기간 — 12월 첫 주, 마지막 열흘 남짓 */
export function isTaxDeadlineWindow(today: string): boolean {
  const md = today.slice(5);
  return (md >= "12-01" && md <= "12-07") || (md >= "12-20" && md <= "12-31");
}
