import { createHash, randomBytes } from "node:crypto";

/** 비밀번호 재설정 링크 유효 시간 */
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** 링크에 넣을 원문 토큰 (URL 에 그대로 쓸 수 있는 43자) */
export function newResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB 에는 원문 대신 이 값만 저장한다 — DB 가 새도 링크를 만들 수 없게 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 원문 토큰 모양 검사 (DB 조회 전에 걸러 낸다) */
export function isResetTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
