import { describe, expect, it } from "vitest";
import { findSuspectedDuplicates, type DupCandidate } from "../merchant-rules";

const tx = (id: string, amount: number, over: Partial<DupCandidate> = {}): DupCandidate => ({
  id,
  type: "EXPENSE",
  date: "2026-11-03",
  merchant: "스타벅스 잠실점",
  amount: BigInt(amount),
  notDuplicate: false,
  ...over,
});

describe("같은 결제 의심", () => {
  it("같은 날·같은 가맹점·금액 3% 안이면 묶는다 (공백 차이 무시)", () => {
    const m = findSuspectedDuplicates([tx("a", 10_000), tx("b", 10_100, { merchant: "스타벅스잠실점" }), tx("c", 4_500)]);
    expect(m.get("a")).toEqual(["a", "b"]);
    expect(m.get("b")).toEqual(["a", "b"]);
    expect(m.has("c")).toBe(false);
  });

  it("날짜·가맹점·종류가 다르거나 가맹점이 없으면 묶지 않는다", () => {
    expect(findSuspectedDuplicates([tx("a", 10_000), tx("b", 10_000, { date: "2026-11-04" })]).size).toBe(0);
    expect(findSuspectedDuplicates([tx("a", 10_000), tx("b", 10_000, { merchant: "투썸" })]).size).toBe(0);
    expect(findSuspectedDuplicates([tx("a", 10_000), tx("b", 10_000, { type: "INCOME" })]).size).toBe(0);
    expect(findSuspectedDuplicates([tx("a", 10_000, { merchant: null }), tx("b", 10_000, { merchant: " " })]).size).toBe(0);
  });

  it("묶음 전체가 '다른 결제예요'면 빼고, 새 기록이 끼면 다시 의심한다", () => {
    expect(findSuspectedDuplicates([tx("a", 10_000, { notDuplicate: true }), tx("b", 10_000, { notDuplicate: true })]).size).toBe(0);
    const m = findSuspectedDuplicates([tx("a", 10_000, { notDuplicate: true }), tx("b", 10_000, { notDuplicate: true }), tx("c", 10_000)]);
    expect(m.get("c")).toEqual(["a", "b", "c"]);
  });

  it("세 건이 이어지면 한 묶음", () => {
    const m = findSuspectedDuplicates([tx("a", 10_000), tx("b", 10_250), tx("c", 10_500)]);
    expect(m.get("a")).toEqual(["a", "b", "c"]);
  });
});
