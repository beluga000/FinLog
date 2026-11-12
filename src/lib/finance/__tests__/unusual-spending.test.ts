import { describe, expect, it } from "vitest";
import { detectUnusualSpending } from "../unusual-spending";

const cat = (categoryId: string, amount: bigint) => ({ categoryId, name: categoryId, amount, share: null });
const month = (...cats: ReturnType<typeof cat>[]) => ({ expense: cats.reduce((s, c) => s + c.amount, 0n), byCategory: cats });

describe("평소와 다른 지출", () => {
  const history = [month(cat("식비", 400_000n), cat("쇼핑", 100_000n)), month(cat("식비", 500_000n)), month(cat("식비", 600_000n), cat("쇼핑", 200_000n))];

  it("평균보다 40% 이상·5만 원 이상 많으면 알린다", () => {
    const [item] = detectUnusualSpending([cat("식비", 800_000n)], history);
    expect(item).toMatchObject({ name: "식비", average: 500_000n, diff: 300_000n });
    expect(item.rate).toBeCloseTo(0.6);
  });

  it("조금 늘어난 것은 알리지 않는다", () => {
    expect(detectUnusualSpending([cat("식비", 650_000n)], history)).toEqual([]);
  });

  it("비율은 커도 금액 차이가 작으면 알리지 않는다", () => {
    // 쇼핑 평균 100,000 → 140,000 (40%, 4만 원)
    expect(detectUnusualSpending([cat("쇼핑", 140_000n)], history)).toEqual([]);
  });

  it("평소 없던 지출은 10만 원 이상이면 알린다", () => {
    const [item] = detectUnusualSpending([cat("의료", 150_000n)], history);
    expect(item).toMatchObject({ name: "의료", average: 0n, rate: null });
    expect(detectUnusualSpending([cat("의료", 90_000n)], history)).toEqual([]);
  });

  it("비교할 달이 2달 안 되면 알리지 않는다 (가입 직후)", () => {
    expect(detectUnusualSpending([cat("식비", 900_000n)], [month(), month(), month(cat("식비", 100_000n))])).toEqual([]);
  });

  it("차이가 큰 순서로 최대 3개", () => {
    const items = detectUnusualSpending(
      [cat("식비", 1_000_000n), cat("쇼핑", 500_000n), cat("의료", 200_000n), cat("여행", 120_000n)],
      history,
    );
    expect(items.map((i) => i.name)).toEqual(["식비", "쇼핑", "의료"]);
  });
});
