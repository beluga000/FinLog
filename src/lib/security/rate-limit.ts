import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * 고정 창 시도 횟수 제한. 서버리스 인스턴스끼리 공유해야 하므로 메모리 대신 DB 한 행으로 센다.
 * 한 번의 upsert 로 증가·창 초기화를 원자적으로 처리한다.
 * @returns true = 허용, false = 한도 초과
 */
export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs);
  const now = new Date();
  // 현재 시각도 앱에서 넘긴다: Prisma 는 timestamp(시간대 없음)를 UTC 로 저장하는데
  // SQL now() 는 DB 세션 시간대로 바뀌어 비교가 어긋난다 (로컬 KST 세션에서 매번 창이 초기화됨)
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 0) <= limit;
}

/** 성공 시 카운터 초기화 (예: 로그인 성공하면 그 이메일의 실패 횟수를 지운다) */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** 요청자 IP — Vercel 은 x-forwarded-for 첫 값이 클라이언트 */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

const MIN = 60_000;

/** 정책: 키 접두사 · 한도 · 창 */
export const LIMITS = {
  loginEmail: { limit: 5, windowMs: 15 * MIN }, // 계정별 비밀번호 대입
  loginIp: { limit: 30, windowMs: 15 * MIN }, // 한 IP 에서 여러 계정 대입
  signupIp: { limit: 5, windowMs: 60 * MIN },
  joinUser: { limit: 10, windowMs: 60 * MIN }, // 초대 코드 대입
  passwordUser: { limit: 5, windowMs: 15 * MIN }, // 비밀번호 변경·탈퇴·가구 나가기 — 현재 비밀번호 대입
  resetIp: { limit: 10, windowMs: 60 * MIN }, // 재설정 링크 토큰 대입
  captureUser: { limit: 30, windowMs: 10 * MIN }, // 문자·캡처 점검, 여러 건 기록 (한 번에 최대 50건)
  searchUser: { limit: 60, windowMs: MIN }, // 가계부 검색 (입력할 때마다 부른다)
  pushTestUser: { limit: 5, windowMs: 60 * MIN }, // 시험 알림
} as const;

/** 정책 이름으로 한 번 세기 — true = 허용 */
export function consumeLimit(policy: keyof typeof LIMITS, subject: string): Promise<boolean> {
  const { limit, windowMs } = LIMITS[policy];
  return consumeRateLimit(`${policy}:${subject}`, limit, windowMs);
}

export const RATE_LIMITED_MESSAGE = "시도가 너무 많습니다. 잠시 뒤에 다시 시도하세요.";
