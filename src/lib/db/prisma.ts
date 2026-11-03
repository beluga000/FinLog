import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DATABASE_URL: Neon 은 pooled(-pooler) 주소. 드라이버는 node-postgres(pg)
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Prisma @db.Date ↔ "YYYY-MM-DD" (UTC 자정으로 저장되므로 그대로 자른다) */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
