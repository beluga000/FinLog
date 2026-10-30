import { describe, expect, it } from "vitest";
import { describeAheadChange, suggestAdjustments } from "../closing";

const base = {
  overspent: false,
  categoryDiffs: [
    { name: "식비", diff: 120_000n },
    { name: "쇼핑", diff: 300_000n },
    { name: "교통", diff: -50_000n },
  ],
  compared: true,
  savingShort: [false, false] as [boolean, boolean],
  primaryGoal: { id: "g1", name: "내 집 마련" },
  staleAccounts: [] as { name: string }[],
  ledgerHref: "/ledger?month=2026-09",
};

describe("월간 결산 조정 제안 (§4-7)", () => {
  it("문제가 없으면 제안이 없다", () => {
    expect(suggestAdjustments(base)).toEqual([]);
  });

  it("초과 시 가장 많이 늘어난 카테고리를 제안한다", () => {
    const [s] = suggestAdjustments({ ...base, overspent: true });
    expect(s).toMatchObject({ kind: "category", href: "/ledger?month=2026-09" });
    expect(s.text).toContain("쇼핑 +30만");
  });

  it("전월 기록이 없으면 가장 많이 쓴 카테고리를 다른 문구로", () => {
    const [s] = suggestAdjustments({ ...base, overspent: true, compared: false });
    expect(s.text).toBe("쇼핑 30만 — 지난달 가장 많이 쓴 곳이에요. 이번 달엔 줄여 보세요.");
  });

  it("초과했어도 늘어난 카테고리가 없으면 카테고리 제안은 없다", () => {
    expect(suggestAdjustments({ ...base, overspent: true, categoryDiffs: [{ name: "식비", diff: -1n }] })).toEqual([]);
  });

  it("목표 저축 미달은 2개월 연속일 때만 목표 조정을 제안한다", () => {
    expect(suggestAdjustments({ ...base, savingShort: [false, true] })).toEqual([]);
    expect(suggestAdjustments({ ...base, savingShort: [true, true] })).toEqual([
      expect.objectContaining({ kind: "goal", href: "/goals/g1#what-if" }),
    ]);
    expect(suggestAdjustments({ ...base, savingShort: [true, true], primaryGoal: null })).toEqual([]);
  });

  it("오래된 잔액 계좌는 한 줄로 묶는다", () => {
    const [s] = suggestAdjustments({ ...base, staleAccounts: [{ name: "ISA" }, { name: "연금" }, { name: "주식" }] });
    expect(s).toMatchObject({ kind: "balance", href: "/assets" });
    expect(s.text).toContain("ISA 외 2개");
  });

  it("최대 3개, 순서는 카테고리 → 목표 → 잔액", () => {
    const all = suggestAdjustments({
      ...base,
      overspent: true,
      savingShort: [true, true],
      staleAccounts: [{ name: "ISA" }],
    });
    expect(all.map((s) => s.kind)).toEqual(["category", "goal", "balance"]);
  });
});

describe("대표 목표 앞섬·뒤처짐 변화", () => {
  it("전월 대비 변화를 문장으로", () => {
    expect(describeAheadChange(3, 1)).toBe("3개월 앞섬 (전월보다 2개월 당김)");
    expect(describeAheadChange(-4, -2)).toBe("4개월 뒤처짐 (전월보다 2개월 밀림)");
    expect(describeAheadChange(0, 0)).toBe("0개월 앞섬 (전월과 같음)");
    expect(describeAheadChange(2, null)).toBe("2개월 앞섬");
    expect(describeAheadChange(null, 3)).toBe("지금 납입액으로는 달성이 어려워요");
  });
});
