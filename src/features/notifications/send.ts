import "server-only";
import webpush from "web-push";
import { computeSpendable, getCardDueItems, getShortfallItems, getSpendableSource } from "@/features/dashboard/home";
import { getGoalsOverview, getSpendableGoals } from "@/features/goals/queries";
import { getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { prisma } from "@/lib/db/prisma";
import { composeDailyNotice, composeEventNotices, PUSH_SHORTFALL_DAYS, spendableCrossing, type DailyNotice } from "@/lib/finance/daily-notice";
import { formatCompactKRW } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";
import { composeWeeklyNotice, isWeeklySummaryDay, summarizeWeek, weeklyRangeStart } from "@/lib/finance/weekly-summary";

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

/**
 * 일이 생겼을 때 알림 재료 — 카드 결제 이틀 전·당일, 쓸 수 있는 돈 80%·100% 처음 넘은 날, 목표 진행률 새 단계.
 * milestones 는 보낸 뒤 호출자가 milestonePushed 를 올린다 (부부 둘 다 받게 한 번에).
 */
export async function buildEventNotices(
  ctx: { householdId: string; userId: string },
  today: DateStr,
  monthStartDay: number,
): Promise<{ notices: DailyNotice[]; milestones: { goalId: string; percent: number }[] }> {
  const [cards, { goals }, pushed] = await Promise.all([
    getCardDueItems(ctx, { today }),
    getGoalsOverview(ctx, { today, monthStartDay }),
    prisma.assetGoal.findMany({ where: { householdId: ctx.householdId }, select: { id: true, milestonePushed: true } }),
  ]);
  const source = await getSpendableSource(ctx, "us", { today, monthStartDay, goals });
  // 어제까지 쓴 것 vs 그 전날까지 쓴 것 — 아침 9시 알림이라 오늘 기록은 보지 않는다
  const yesterday = addDays(today, -1);
  const upTo = (d: DateStr) => computeSpendable({ ...source, txs: source.txs.filter((t) => !t.date || t.date <= d) });
  const after = upTo(yesterday);
  const level = spendableCrossing(upTo(addDays(today, -2)).usedRatio, after.usedRatio);

  const pushedById = new Map(pushed.map((g) => [g.id, g.milestonePushed]));
  const milestones = goals
    .filter((g) => g.milestone !== null && g.milestone > (pushedById.get(g.id) ?? 0))
    .map((g) => ({ goalId: g.id, name: g.name, percent: g.milestone! }));

  return {
    notices: composeEventNotices({
      today,
      cardDues: cards.map((c) => ({
        cardId: c.card.id,
        cardName: c.card.name,
        date: c.date,
        toPay: c.card.toPay,
        paymentName: c.payment?.name ?? null,
        shortBy: c.payment ? c.card.toPay - c.payment.balance : null,
      })),
      spendable: level ? { level, remaining: after.remaining } : null,
      milestones,
    }),
    milestones: milestones.map(({ goalId, percent }) => ({ goalId, percent })),
  };
}

/**
 * 월요일 주간 요약 — 지난주 변동 지출과 평소 비교, 가장 늘어난 대분류, 이번 주 하루 쓸 수 있는 돈.
 * 그 사람이 "우리" 화면에서 보는 범위(배우자 비공개 제외, 합계만 공개는 금액에 포함) 그대로.
 */
export async function buildWeeklyNotice(
  ctx: { householdId: string; userId: string },
  today: DateStr,
  monthStartDay: number,
): Promise<DailyNotice | null> {
  const [{ items, summarized }, categories, goals] = await Promise.all([
    getScopedTransactions(ctx, { start: weeklyRangeStart(today), end: today }, "us"),
    getCategories(ctx),
    getSpendableGoals(ctx, { today, monthStartDay }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parentOf = new Map(
    categories.map((c) => {
      const parent = c.parentId ? byId.get(c.parentId) ?? c : c;
      return [c.id, { id: parent.id, name: parent.name }] as const;
    }),
  );
  const expenses = [...items, ...summarized]
    .filter((t) => t.type === "EXPENSE")
    .map((t) => ({ date: t.date, amount: t.amount, categoryId: t.categoryId, isFixed: t.isFixed }));
  const summary = summarizeWeek({ today, expenses, parentOf });
  const spendable = computeSpendable(await getSpendableSource(ctx, "us", { today, monthStartDay, goals }));
  return composeWeeklyNotice({ summary, spendable: spendable.usedRatio === null ? null : spendable });
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

/** 여러 알림을 차례로 — 끊긴 기기는 첫 알림에서 지워지므로 다음 알림부터는 남은 기기로만 */
async function deliverAll(list: Sub[], notices: DailyNotice[]): Promise<{ sent: number; removed: number }> {
  let alive = list;
  let sent = 0;
  let removed = 0;
  for (const n of notices) {
    if (!alive.length) break;
    const r = await deliver(alive, n);
    sent += r.sent;
    removed += r.removed;
    if (r.removed) {
      const left = new Set((await prisma.pushSubscription.findMany({ where: { id: { in: alive.map((s) => s.id) } }, select: { id: true } })).map((s) => s.id));
      alive = alive.filter((s) => left.has(s.id));
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
 * 하루 알림 보내기 (크론). 구독한 사람마다 아침 알림 + 일이 생겼을 때 알림을 만들어 그 사람의 모든 기기로.
 */
export async function sendDailyNotifications(today: DateStr): Promise<{ users: number; sent: number; removed: number; skipped?: string }> {
  if (!configure()) return { users: 0, sent: 0, removed: 0, skipped: "VAPID 키 없음" };
  const subs = await prisma.pushSubscription.findMany({
    include: {
      user: {
        select: {
          memberships: { where: { leftAt: null }, select: { householdId: true, household: { select: { monthStartDay: true } } }, take: 1 },
        },
      },
    },
  });
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  let sent = 0;
  let removed = 0;
  const reached = new Map<string, number>(); // 보낸 목표 진행률 단계 — 끝나고 한 번에 저장
  for (const [userId, list] of byUser) {
    const membership = list[0].user.memberships[0];
    if (!membership) continue;
    const ctx = { householdId: membership.householdId, userId };
    // 한 사람 알림 만들기가 실패해도 다른 사람에게는 보낸다
    try {
      const monthStartDay = membership.household.monthStartDay;
      const [daily, events, weekly] = await Promise.all([
        buildDailyNotice(ctx, today),
        buildEventNotices(ctx, today, monthStartDay),
        isWeeklySummaryDay(today) ? buildWeeklyNotice(ctx, today, monthStartDay) : null,
      ]);
      const notices = [...(daily ? [daily] : []), ...events.notices, ...(weekly ? [weekly] : [])];
      if (!notices.length) continue;
      const r = await deliverAll(list, notices);
      sent += r.sent;
      removed += r.removed;
      if (r.sent) for (const m of events.milestones) reached.set(m.goalId, Math.max(reached.get(m.goalId) ?? 0, m.percent));
    } catch (e) {
      console.error("[notify]", userId, e);
    }
  }
  for (const [id, percent] of reached) {
    await prisma.assetGoal.updateMany({ where: { id, milestonePushed: { lt: percent } }, data: { milestonePushed: percent } });
  }
  return { users: byUser.size, sent, removed };
}
