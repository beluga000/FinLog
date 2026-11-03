/**
 * DB 통합 테스트 — 시도 횟수 제한 (로그인·가입·초대 코드 대입 방지)
 * 실행: TEST_DATABASE_URL=postgresql://... npm run test:db
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit, resetRateLimit } from "@/lib/security/rate-limit";

const TAG = `t${Date.now()}`;

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("consumeRateLimit", () => {
  it("한도까지 허용하고 그다음부터 막는다", async () => {
    const key = `${TAG}:limit`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(key, 3, 60_000));
    expect(results).toEqual([true, true, true, false]);
  });

  it("동시에 들어온 시도도 정확히 센다", async () => {
    const key = `${TAG}:concurrent`;
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit(key, 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    expect(row?.count).toBe(10);
  });

  it("창이 지나면 다시 1부터 센다", async () => {
    const key = `${TAG}:window`;
    await consumeRateLimit(key, 1, 60_000);
    expect(await consumeRateLimit(key, 1, 60_000)).toBe(false);
    await prisma.rateLimit.update({ where: { key }, data: { resetAt: new Date(Date.now() - 1000) } });
    expect(await consumeRateLimit(key, 1, 60_000)).toBe(true);
  });

  it("초기화하면 바로 다시 허용한다", async () => {
    const key = `${TAG}:reset`;
    await consumeRateLimit(key, 1, 60_000);
    expect(await consumeRateLimit(key, 1, 60_000)).toBe(false);
    await resetRateLimit(key);
    expect(await consumeRateLimit(key, 1, 60_000)).toBe(true);
  });
});
