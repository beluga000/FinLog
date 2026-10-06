import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Prisma @db.Date ↔ "YYYY-MM-DD" (UTC 자정으로 저장되므로 그대로 자른다) */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
