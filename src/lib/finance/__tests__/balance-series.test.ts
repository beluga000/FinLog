import { describe, expect, it } from "vitest";
import { balanceSeries, computeBalances, type BalanceSnapshot, type FlowTx } from "../balance";
import type { DateStr } from "../types";

const day = (n: number): DateStr => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10);

/** 결정적 의사난수 — 실행마다 같은 데이터 */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe("balanceSeries — 여러 날짜 잔액을 한 번에", () => {
  it("각 날짜 값이 computeBalances 와 같다 (스냅샷·같은 날 거래·추적 안 하는 계좌 포함)", () => {
    const r = rng(7);
    const ids = ["a", "b", "c"];
    const snapshots: BalanceSnapshot[] = [];
    for (const id of [...ids, "x"]) {
      for (let d = 0; d < 400; d += 40 + Math.floor(r() * 60)) {
        if (r() < 0.6) snapshots.push({ accountId: id, asOf: day(d), balance: BigInt(Math.floor(r() * 1e7)) });
      }
    }
    const txs: FlowTx[] = [];
    for (let i = 0; i < 800; i++) {
      const pick = () => (r() < 0.15 ? null : ["a", "b", "c", "x"][Math.floor(r() * 4)]);
      txs.push({ date: day(Math.floor(r() * 420)), amount: BigInt(1 + Math.floor(r() * 500_000)), fromAccountId: pick(), toAccountId: pick() });
    }
    // 스냅샷 날짜와 같은 날 거래도 꼭 넣는다
    txs.push({ date: snapshots[0].asOf, amount: 999n, fromAccountId: null, toAccountId: snapshots[0].accountId });

    const dates = [day(410), day(0), day(39), ...Array.from({ length: 30 }, (_, i) => day(i * 14)), snapshots[0].asOf, day(-5)];
    const series = balanceSeries(ids, snapshots, txs, dates);
    dates.forEach((d, i) => {
      expect(Object.fromEntries(series[i])).toEqual(Object.fromEntries(computeBalances(ids, snapshots, txs, d)));
    });
  });

  it("빈 입력 · 날짜 없음", () => {
    expect(balanceSeries(["a"], [], [], [day(1)])[0].get("a")).toBe(0n);
    expect(balanceSeries(["a"], [], [], [])).toEqual([]);
  });
});
