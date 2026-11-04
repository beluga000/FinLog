import { describe, expect, it } from "vitest";
import { describeAheadChange, findFrequentMerchant, findOneOffExpense, suggestAdjustments, type ClosingExpense } from "../closing";

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

  it("큰 지출 한 건은 맨 앞에 두고, 카테고리 증감에서는 뺀다", () => {
    const oneOff = { label: "하이마트", categoryName: "쇼핑", amount: 1_200_000n, share: 0.4 };
    const out = suggestAdjustments({ ...base, overspent: true, oneOff, categoryDiffs: [{ name: "쇼핑", diff: 1_300_000n }, { name: "식비", diff: 50_000n }] });
    expect(out.map((s) => s.kind)).toEqual(["oneOff", "category"]);
    expect(out[0].text).toBe("하이마트 120만 한 건이 지난달 지출의 40%예요. 한 번뿐인 지출이면 이번 달은 평소대로 가도 돼요.");
    // 쇼핑 증가분 130만 중 120만이 한 건 → 남은 10만이 식비 5만보다 크다
    expect(out[1].text).toContain("쇼핑 +10만");
  });

  it("큰 지출을 빼면 늘어난 곳이 없을 때 카테고리 제안은 없다", () => {
    const oneOff = { label: "하이마트", categoryName: "쇼핑", amount: 1_200_000n, share: 0.4 };
    const out = suggestAdjustments({ ...base, overspent: true, oneOff, categoryDiffs: [{ name: "쇼핑", diff: 1_000_000n }] });
    expect(out.map((s) => s.kind)).toEqual(["oneOff"]);
  });

  it("초과하지 않았으면 큰 지출 한 건 제안은 없다", () => {
    const oneOff = { label: "하이마트", categoryName: "쇼핑", amount: 1_200_000n, share: 0.4 };
    expect(suggestAdjustments({ ...base, oneOff })).toEqual([]);
  });

  it("남은 돈은 대표 목표 계좌로 옮기라고 하고, 당겨지는 개월이 있으면 함께", () => {
    const goal = { id: "g1", name: "내 집 마련", monthsSooner: 1 };
    expect(suggestAdjustments({ ...base, surplus: { amount: 230_000n, goal } })).toEqual([
      { kind: "surplus", text: "지난달 23만 남겼어요. 내 집 마련 계좌로 옮기면 목표가 1개월 당겨져요.", href: "/goals/g1" },
    ]);
    const [noMonths] = suggestAdjustments({ ...base, surplus: { amount: 230_000n, goal: { ...goal, monthsSooner: null } } });
    expect(noMonths.text).toBe("지난달 23만 남겼어요. 내 집 마련 계좌로 옮겨 두면 목표에 보탬이 돼요.");
    const [noGoal] = suggestAdjustments({ ...base, surplus: { amount: 230_000n, goal: null } });
    expect(noGoal).toMatchObject({ kind: "surplus", href: "/assets" });
  });

  it("남은 돈이 10만 원 미만이거나 초과한 달이면 옮기기 제안은 없다", () => {
    expect(suggestAdjustments({ ...base, surplus: { amount: 99_999n, goal: null } })).toEqual([]);
    const out = suggestAdjustments({ ...base, overspent: true, categoryDiffs: [], surplus: { amount: 500_000n, goal: null } });
    expect(out).toEqual([]);
  });

  it("사용처 집중과 확인 안 한 정기 거래", () => {
    const out = suggestAdjustments({ ...base, frequentMerchant: { name: "스타벅스", count: 14, amount: 84_000n }, pendingReviews: 4 });
    expect(out).toEqual([
      { kind: "merchant", text: "스타벅스 14번, 8.4만 — 횟수를 절반으로 줄이면 한 달 4.2만 아껴요.", href: "/ledger?month=2026-09" },
      { kind: "review", text: "확인 안 한 정기 거래 4건이 있어요. 확인해야 결산이 정확해져요.", href: "/dashboard" },
    ]);
  });

  it("많이 걸리면 우선순위 순으로 3개만", () => {
    const out = suggestAdjustments({
      ...base,
      savingShort: [true, true],
      staleAccounts: [{ name: "ISA" }],
      frequentMerchant: { name: "스타벅스", count: 9, amount: 50_000n },
      pendingReviews: 1,
      surplus: { amount: 200_000n, goal: null },
    });
    expect(out.map((s) => s.kind)).toEqual(["surplus", "goal", "merchant"]);
  });
});

const exp = (amount: bigint, merchant: string | null = null, fixed = false): ClosingExpense => ({ merchant, categoryName: "쇼핑", amount, fixed });

describe("큰 지출 한 건 찾기", () => {
  it("고정·정기가 아닌 가장 큰 한 건이 20% 이상, 30만 이상일 때만", () => {
    expect(findOneOffExpense([exp(1_200_000n, " 하이마트 "), exp(800_000n)], 3_000_000n)).toEqual({
      label: "하이마트",
      categoryName: "쇼핑",
      amount: 1_200_000n,
      share: 0.4,
    });
    expect(findOneOffExpense([exp(500_000n)], 3_000_000n)).toBeNull(); // 17%
    expect(findOneOffExpense([exp(250_000n)], 500_000n)).toBeNull(); // 30만 미만
    expect(findOneOffExpense([exp(2_000_000n, "월세", true)], 3_000_000n)).toBeNull();
    expect(findOneOffExpense([], 0n)).toBeNull();
  });

  it("사용처가 없으면 카테고리 이름으로", () => {
    expect(findOneOffExpense([exp(1_000_000n)], 2_000_000n)?.label).toBe("쇼핑");
  });
});

describe("사용처 집중 찾기", () => {
  it("8번 이상 간 사용처 중 가장 자주 간 곳, 고정·정기와 빈 사용처는 제외", () => {
    const list = [
      ...Array.from({ length: 8 }, () => exp(5_000n, "스타벅스")),
      ...Array.from({ length: 8 }, () => exp(9_000n, "배민 ")),
      ...Array.from({ length: 10 }, () => exp(50_000n, "관리비", true)),
      ...Array.from({ length: 10 }, () => exp(1_000n, "  ")),
    ];
    expect(findFrequentMerchant(list)).toEqual({ name: "배민", count: 8, amount: 72_000n });
    expect(findFrequentMerchant(list.slice(1, 8))).toBeNull();
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
