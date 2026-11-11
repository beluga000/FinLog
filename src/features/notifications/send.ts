import "server-only";
import webpush from "web-push";
import { getShortfallItems } from "@/features/dashboard/home";
import { prisma } from "@/lib/db/prisma";
import { composeDailyNotice, PUSH_SHORTFALL_DAYS, type DailyNotice } from "@/lib/finance/daily-notice";
import { formatCompactKRW } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

/** VAPID 키가 없으면(로컬·미설정) 보내지 않는다 */
function configure(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://finlog-chi.vercel.app", pub, priv);
  return true;
}

/** 한 사람의 오늘 알림 — 그 사람이 볼 수 있는 통장·기록 기준 */
export async function buildDailyNotice(ctx: { householdId: string; userId: string }, today: DateStr): Promise<DailyNotice | null> {
  const until = addDays(today, PUSH_SHORTFALL_DAYS);
  const [shortfalls, reviewRows] = await Promise.all([
    getShortfallItems(ctx, { today }),
    prisma.transaction.findMany({
      where: { householdId: ctx.householdId, deletedAt: null, needsReview: true, createdByUserId: ctx.userId },
      select: { id: true },
      take: 100,
    }),
  ]);
  return composeDailyNotice({
    today,
    shortfalls: shortfalls
      .filter((s) => s.date <= until)
      .map((s) => ({
        date: s.date,
        accountName: s.account.name,
        amount: s.amount,
        cause: s.causes[0] ? `${s.causes[0].label} ${formatCompactKRW(s.causes[0].amount)}` : null,
      })),
    reviewCount: reviewRows.length,
  });
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** 기기들로 보내기 — 구독이 끊긴 기기(404·410)는 지운다 */
async function deliver(list: Sub[], notice: DailyNotice): Promise<{ sent: number; removed: number }> {
  const payload = JSON.stringify(notice);
  let sent = 0;
  let removed = 0;
  for (const s of list) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        removed++;
      }
    }
  }
  return { sent, removed };
}

/** 한 사람에게 지금 보내기 (시험 알림) — 오늘 알림이 있으면 그것, 없으면 fallback */
export async function sendToUser(ctx: { householdId: string; userId: string }, today: DateStr, fallback: DailyNotice) {
  if (!configure()) return { sent: 0, removed: 0, skipped: true };
  const list = await prisma.pushSubscription.findMany({ where: { userId: ctx.userId } });
  if (!list.length) return { sent: 0, removed: 0, skipped: false };
  const notice = (await buildDailyNotice(ctx, today)) ?? fallback;
  return { ...(await deliver(list, notice)), skipped: false };
}

/**
 * 하루 알림 보내기 (크론). 구독한 사람마다 한 번 만들어 그 사람의 모든 기기로.
 */
export async function sendDailyNotifications(today: DateStr): Promise<{ users: number; sent: number; removed: number; skipped?: string }> {
  if (!configure()) return { users: 0, sent: 0, removed: 0, skipped: "VAPID 키 없음" };
  const subs = await prisma.pushSubscription.findMany({
    include: { user: { select: { memberships: { select: { householdId: true }, take: 1 } } } },
  });
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  let sent = 0;
  let removed = 0;
  for (const [userId, list] of byUser) {
    const householdId = list[0].user.memberships[0]?.householdId;
    if (!householdId) continue;
    const notice = await buildDailyNotice({ householdId, userId }, today);
    if (!notice) continue;
    const r = await deliver(list, notice);
    sent += r.sent;
    removed += r.removed;
  }
  return { users: byUser.size, sent, removed };
}
