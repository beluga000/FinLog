import { describe, expect, it } from "vitest";
import { explainSpendableResult } from "../closing";

const cat = (name: string, amount: number) => ({ name, amount: BigInt(amount) });

describe("결산 — 무엇 때문인지", () => {
  const previous = [cat("식비", 600_000), cat("쇼핑·의류", 100_000), cat("문화·여가", 200_000)];

  it("넘긴 달: 큰 지출 한 건 먼저, 그 금액은 빼고 많이 늘어난 곳부터", () => {
    const d = explainSpendableResult({
      overspent: true,
      current: [cat("식비", 750_000), cat("쇼핑·의류", 1_300_000), cat("문화·여가", 150_000)],
      previous,
      compared: true,
      oneOff: { label: "삼성 냉장고", categoryName: "쇼핑·의류", amount: 1_000_000n, share: 0.4 },
    });
    expect(d).toEqual([
      { kind: "oneOff", name: "삼성 냉장고", amount: 1_000_000n, diff: null },
      { kind: "category", name: "쇼핑·의류", amount: 1_300_000n, diff: 200_000n },
      { kind: "category", name: "식비", amount: 750_000n, diff: 150_000n },
    ]);
  });

  it("남긴 달: 많이 줄인 곳부터 — 이번 달에 안 쓴 카테고리도", () => {
    const d = explainSpendableResult({ overspent: false, current: [cat("식비", 500_000), cat("쇼핑·의류", 120_000)], previous, compared: true });
    expect(d.map((x) => [x.name, x.diff])).toEqual([
      ["문화·여가", -200_000n],
      ["식비", -100_000n],
    ]);
  });

  it("바라는 쪽 증감이 없으면 증감이 큰 곳, 전월 기록이 없으면 많이 쓴 곳 3개", () => {
    const up = explainSpendableResult({ overspent: false, current: [cat("식비", 700_000), cat("쇼핑·의류", 100_000), cat("문화·여가", 200_000)], previous, compared: true });
    expect(up).toEqual([{ kind: "category", name: "식비", amount: 700_000n, diff: 100_000n }]);
    const first = explainSpendableResult({
      overspent: true,
      current: [cat("A", 1), cat("B", 300), cat("C", 200), cat("D", 100), cat("E", 0)],
      previous: [],
      compared: false,
    });
    expect(first.map((x) => [x.name, x.diff])).toEqual([["B", null], ["C", null], ["D", null]]);
  });
});
