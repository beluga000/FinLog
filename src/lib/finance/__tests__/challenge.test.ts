import { describe, expect, it } from "vitest";
import { challengeLimit, countVisits, describeChallengeResult } from "../challenge";

describe("챌린지", () => {
  it("절반까지 (올림)", () => {
    expect(challengeLimit(8)).toBe(4);
    expect(challengeLimit(9)).toBe(5);
    expect(challengeLimit(1)).toBe(1);
  });

  it("지점 이름이 달라도 같은 가게", () => {
    expect(countVisits(["스타벅스", "스타벅스 강남점", "스타벅스리저브", null, "투썸", "STARBUCKSX"], "스타벅스")).toBe(3);
  });

  it("지키면 칭찬, 못 지켜도 줄었으면 줄어든 만큼, 아니면 다시", () => {
    const base = { merchant: "배달의민족", limitCount: 4, baselineCount: 8, baselineAmount: 259_000n };
    expect(describeChallengeResult({ ...base, actual: 3 })).toEqual({ text: "배달의민족 4번까지 — 3번으로 지켰어요 · 약 16.2만 아꼈어요", tone: "good" });
    expect(describeChallengeResult({ ...base, actual: 6 }).text).toBe("배달의민족 8번 → 6번으로 줄었어요 · 약 6.5만 아꼈어요");
    expect(describeChallengeResult({ ...base, actual: 9 }).tone).toBe("neutral");
  });
});
