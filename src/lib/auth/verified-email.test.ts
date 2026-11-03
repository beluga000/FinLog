import { describe, expect, it, vi } from "vitest";

// next-auth 본체는 테스트 환경에서 불러오지 않는다 (순수 함수만 검증)
vi.mock("next-auth", () => ({ default: () => ({}), CredentialsSignin: class extends Error {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const { isVerifiedEmail } = await import("./index");

describe("소셜 로그인 이메일 인증 여부", () => {
  it("Google 은 email_verified 가 true 일 때만", () => {
    expect(isVerifiedEmail("google", { email_verified: true })).toBe(true);
    expect(isVerifiedEmail("google", { email_verified: false })).toBe(false);
    expect(isVerifiedEmail("google", {})).toBe(false);
  });

  it("Kakao 는 인증·유효 둘 다 true 일 때만", () => {
    expect(isVerifiedEmail("kakao", { kakao_account: { is_email_verified: true, is_email_valid: true } })).toBe(true);
    expect(isVerifiedEmail("kakao", { kakao_account: { is_email_verified: true, is_email_valid: false } })).toBe(false);
    expect(isVerifiedEmail("kakao", { kakao_account: { is_email_verified: false, is_email_valid: true } })).toBe(false);
  });

  it("알 수 없는 제공자·프로필 없음은 미인증으로 본다", () => {
    expect(isVerifiedEmail("github", { email_verified: true })).toBe(false);
    expect(isVerifiedEmail("google", undefined)).toBe(false);
  });
});
