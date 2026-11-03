/**
 * 초대 코드: 8자리, 헷갈리는 I·O·0·1 을 뺀 32글자 → 32^8 ≈ 1조 가지 (기존 6자리 숫자 100만 가지는 대입 가능).
 * 클라이언트 입력 정규화와 서버 검증이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */
export const INVITE_CODE_LENGTH = 8;
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/** 입력값을 대문자로 바꾸고 허용 글자만 남긴다 */
export function normalizeInviteCode(v: string): string {
  return v
    .toUpperCase()
    .split("")
    .filter((c) => INVITE_ALPHABET.includes(c))
    .join("")
    .slice(0, INVITE_CODE_LENGTH);
}
