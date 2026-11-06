import { describe, expect, it } from "vitest";
import { summarizeTaxRoom, taxRuleFor, taxWrappersFor, type TaxYearRule } from "../tax-accounts";

const rule: TaxYearRule = {
  year: 2026,
  pensionSavingsCap: 6_000_000,
  pensionTotalCap: 9_000_000,
  creditRateHigh: 0.165,
  creditRateLow: 0.132,
  highRateMaxSalary: 55_000_000,
  isaAnnualCap: 20_000_000,
  source: "test",
};

describe("summarizeTaxRoom", () => {
  it("연금저축 360만 → 남은 540만, 채우면 71.3만~89.1만", () => {
    const r = summarizeTaxRoom([{ wrapper: "PENSION_SAVINGS", amount: 3_600_000 }], rule, { pension: true, isa: false });
    expect(r.pension).toEqual({
      savings: 3_600_000,
      irp: 0,
      credited: 3_600_000,
      room: 5_400_000,
      irpOnly: false,
      roomRefund: [712_800, 891_000],
      creditedRefund: [475_200, 594_000],
    });
    expect(r.isa).toBeNull();
  });

  it("연금저축은 600만까지만 인정, 남은 한도는 IRP 로만", () => {
    const r = summarizeTaxRoom(
      [
        { wrapper: "PENSION_SAVINGS", amount: 7_000_000 },
        { wrapper: "IRP", amount: 1_000_000 },
      ],
      rule,
      { pension: true, isa: false },
    );
    expect(r.pension?.credited).toBe(7_000_000);
    expect(r.pension?.room).toBe(2_000_000);
    expect(r.pension?.irpOnly).toBe(true);
  });

  it("합산 900만에서 멈춘다", () => {
    const r = summarizeTaxRoom([{ wrapper: "IRP", amount: 12_000_000 }], rule, { pension: true, isa: false });
    expect(r.pension?.credited).toBe(9_000_000);
    expect(r.pension?.room).toBe(0);
    expect(r.pension?.irpOnly).toBe(false);
  });

  it("ISA 연 한도", () => {
    const r = summarizeTaxRoom([{ wrapper: "ISA", amount: 12_000_000 }], rule, { pension: false, isa: true });
    expect(r.isa).toEqual({ paid: 12_000_000, room: 8_000_000 });
    expect(r.pension).toBeNull();
    expect(summarizeTaxRoom([{ wrapper: "ISA", amount: 25_000_000 }], rule, { pension: false, isa: true }).isa?.room).toBe(0);
  });
});

describe("taxRuleFor / taxWrappersFor", () => {
  it("없는 해는 가장 가까운 이전 해 규칙 + assumed", () => {
    expect(taxRuleFor(2026).assumed).toBe(false);
    const next = taxRuleFor(2027);
    expect(next.assumed).toBe(true);
    expect(next.rule.year).toBe(2026);
  });

  it("계좌 종류별 선택지", () => {
    expect(taxWrappersFor("PENSION")).toEqual(["PENSION_SAVINGS", "IRP"]);
    expect(taxWrappersFor("INVESTMENT")).toEqual(["ISA"]);
    expect(taxWrappersFor("CHECKING")).toEqual([]);
  });
});
