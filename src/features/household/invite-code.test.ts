import { describe, expect, it } from "vitest";
import { INVITE_ALPHABET, INVITE_CODE_RE, normalizeInviteCode } from "./invite-code";

describe("초대 코드", () => {
  it("헷갈리는 글자(I·O·0·1)를 빼고 32글자를 쓴다", () => {
    expect(INVITE_ALPHABET).toHaveLength(32);
    expect(INVITE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it("입력을 대문자로 바꾸고 허용 글자만 8자리까지 남긴다", () => {
    expect(normalizeInviteCode("ab cd-2345")).toBe("ABCD2345");
    expect(normalizeInviteCode("abcd2345xyz")).toBe("ABCD2345");
    expect(normalizeInviteCode("O0I1abc")).toBe("ABC");
  });

  it("형식 검사는 8자리 허용 글자만 통과시킨다", () => {
    expect(INVITE_CODE_RE.test("ABCD2345")).toBe(true);
    expect(INVITE_CODE_RE.test("123456")).toBe(false);
    expect(INVITE_CODE_RE.test("ABCD234O")).toBe(false);
  });
});
