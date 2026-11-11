"use server";

import { z } from "zod";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import type { ActionResult } from "@/features/ledger/schema";
import { todayKST } from "@/lib/finance/period";
import { sendToUser } from "./send";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** 이 기기에서 알림 받기 — 같은 기기(endpoint)를 다시 켜면 주인·키만 바꾼다 */
export async function subscribePush(raw: unknown): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "알림을 켤 수 없는 브라우저예요." };
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: ctx.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: ctx.userId, p256dh: keys.p256dh, auth: keys.auth },
  });
  return { ok: true };
}

/** 이 기기 알림 끄기 — 내 구독만 지운다 */
export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  if (typeof endpoint !== "string") return { ok: false, error: "잘못된 요청입니다." };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.userId } });
  return { ok: true };
}

/** 이 기기로 시험 알림 — 오늘 보낼 알림이 있으면 그것을, 없으면 켜졌다는 알림을 */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  const ctx = await requireHousehold();
  const r = await sendToUser(ctx, todayKST(), { title: "알림이 켜졌어요", body: "통장이 모자랄 것 같거나 확인할 기록이 생기면 아침에 알려 드려요.", url: "/dashboard", tag: "test" });
  if (r.skipped) return { ok: false, error: "서버에 알림 설정(VAPID 키)이 아직 없어요." };
  if (!r.sent) return { ok: false, error: "보낼 기기가 없어요. 알림을 다시 켜 주세요." };
  return { ok: true, data: { sent: r.sent } };
}
