import { NextResponse } from "next/server";
import { sendDailyNotifications } from "@/features/notifications/send";
import { todayKST } from "@/lib/finance/period";

/** 매일 아침 알림 (잔액 부족 예보·확인할 일 + 카드 결제·쓸 수 있는 돈·목표 진행률) — Vercel Cron: Authorization: Bearer $CRON_SECRET */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendDailyNotifications(todayKST()));
}
