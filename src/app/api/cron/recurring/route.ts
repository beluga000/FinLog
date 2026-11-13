import { NextResponse } from "next/server";
import { materializeRecurring, purgeDeletedTransactions } from "@/features/ledger/service";
import { prisma } from "@/lib/db/prisma";
import { todayKST } from "@/lib/finance/period";

/**
 * 매일 정기 거래 생성 + 휴지통 비우기(지운 지 30일 지난 기록) — Vercel Cron: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const today = todayKST();
  const households = await prisma.recurringRule.findMany({
    where: { isActive: true },
    distinct: ["householdId"],
    select: { householdId: true },
  });
  let created = 0;
  for (const { householdId } of households) created += await materializeRecurring(householdId, today);
  const purged = await purgeDeletedTransactions();
  return NextResponse.json({ households: households.length, created, purged });
}
