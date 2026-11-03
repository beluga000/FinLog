import { describe, expect, it } from "vitest";
import { applyLoginWindow, isLoginExpired, SESSION_MAX_AGE_SEC } from "./config";

const DAY_MS = SESSION_MAX_AGE_SEC * 1000;

describe("isLoginExpired", () => {
  it("로그인 후 24시간 미만이면 유지, 24시간이 되면 만료", () => {
    const now = 1_000_000_000_000;
    expect(isLoginExpired(now - DAY_MS + 1, now)).toBe(false);
    expect(isLoginExpired(now - DAY_MS, now)).toBe(true);
  });

  it("loginAt 이 없는 예전 토큰은 만료", () => {
    expect(isLoginExpired(undefined)).toBe(true);
    expect(isLoginExpired("123")).toBe(true);
  });
});

describe("applyLoginWindow", () => {
  it("새 로그인이면 loginAt 을 찍고 토큰을 돌려준다", () => {
    const token = applyLoginWindow({ uid: "u1" }, true);
    expect(typeof token?.loginAt).toBe("number");
  });

  it("계속 사용해도 loginAt 은 갱신되지 않고 24시간 뒤 null", () => {
    const loginAt = Date.now() - DAY_MS - 1;
    expect(applyLoginWindow({ uid: "u1", loginAt }, false)).toBeNull();
  });

  it("24시간 안이면 기존 loginAt 그대로 유지", () => {
    const loginAt = Date.now() - 60_000;
    expect(applyLoginWindow({ uid: "u1", loginAt }, false)?.loginAt).toBe(loginAt);
  });
});
