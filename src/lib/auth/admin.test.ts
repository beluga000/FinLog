import { afterEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "./admin";

const original = process.env.ADMIN_EMAILS;
afterEach(() => {
  process.env.ADMIN_EMAILS = original;
});

describe("isAdminEmail", () => {
  it("ADMIN_EMAILS 목록의 이메일만 관리자 (대소문자·공백 무시)", () => {
    process.env.ADMIN_EMAILS = " Boss@Example.com , second@example.com";
    expect(isAdminEmail("boss@example.com")).toBe(true);
    expect(isAdminEmail("SECOND@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("설정이 없거나 이메일이 없으면 아무도 관리자가 아니다", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("boss@example.com")).toBe(false);
    process.env.ADMIN_EMAILS = "";
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});
