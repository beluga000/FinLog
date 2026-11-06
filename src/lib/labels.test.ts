import { describe, expect, it } from "vitest";
import { withRo } from "./labels";

describe("withRo", () => {
  it("받침 없음·ㄹ 받침은 로, 그 외 받침은 으로", () => {
    expect(withRo("비상금")).toBe("비상금으로");
    expect(withRo("내 집 마련")).toBe("내 집 마련으로");
    expect(withRo("여행")).toBe("여행으로");
    expect(withRo("노후 자금")).toBe("노후 자금으로");
    expect(withRo("결혼 비용")).toBe("결혼 비용으로");
    expect(withRo("자동차")).toBe("자동차로");
    expect(withRo("서울")).toBe("서울로");
    expect(withRo("ISA")).toBe("ISA(으)로");
  });
});
