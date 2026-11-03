import { describe, expect, it } from "vitest";
import { safeCallback } from "./callback";

const HOST = "finlog.example.com";

describe("safeCallback", () => {
  it("미들웨어가 넘기는 같은 호스트 절대 주소 → 경로+쿼리 (공유받기 흐름 유지)", () => {
    expect(safeCallback(`https://${HOST}/dashboard?add=shared`, HOST)).toBe("/dashboard?add=shared");
    expect(safeCallback("http://localhost:3000/ledger?add=paste", "localhost:3000")).toBe("/ledger?add=paste");
  });

  it("상대 경로는 그대로", () => {
    expect(safeCallback("/goals", HOST)).toBe("/goals");
  });

  it("다른 호스트·프로토콜 상대 주소·로그인 화면·빈 값은 /dashboard", () => {
    expect(safeCallback("https://evil.com/dashboard", HOST)).toBe("/dashboard");
    expect(safeCallback("//evil.com/x", HOST)).toBe("/dashboard");
    expect(safeCallback("javascript:alert(1)", HOST)).toBe("/dashboard");
    expect(safeCallback("/login?error=expired", HOST)).toBe("/dashboard");
    expect(safeCallback(undefined, HOST)).toBe("/dashboard");
    expect(safeCallback("/goals", null)).toBe("/dashboard");
  });
});
