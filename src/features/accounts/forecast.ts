import "server-only";
import { getAccountFlows, getAccounts, getRecurringRules } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import { computeBalances } from "@/lib/finance/balance";
import {
  DAILY_SPEND_LOOKBACK_DAYS,
  findIdleMoney,
  forecastBalances,
  suggestSaveFirst,
  type AccountForecast,
  type ForecastAccount,
  type ForecastCard,
  type ForecastRule,
} from "@/lib/finance/forecast";
import { addDays } from "@/lib/finance/period";
import type { AccountType, DateStr } from "@/lib/finance/types";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

/** 예보하는 통장 — 매일 돈이 드나드는 곳 (예적금·투자는 정해진 날만 움직인다) */
const FORECAST_TYPES: AccountType[] = ["CHECKING", "CASH"];

/**
 * 통장 잔액 예보 (내가 볼 수 있는 입출금 통장·현금).
 * 정기 규칙은 내가 볼 수 있는 것만 — 배우자의 비공개 자동이체는 반영되지 않는다.
 * 변동 지출 하루 평균 = 최근 90일(기록이 그보다 짧으면 기록 기간) 정기·고정이 아닌 지출 / 일수, 계좌별 금액 합만 읽는다.
 */
export async function getBalanceForecast(ctx: Ctx, opts: { today: DateStr }): Promise<AccountForecast[]> {
  const accounts = await getAccounts(ctx, "us");
  const targets = accounts.filter((a) => FORECAST_TYPES.includes(a.type));
  if (!targets.length) return [];
  const cardsWithBilling = accounts.filter(
    (a) => a.type === "CREDIT_CARD" && a.billingDay !== null && a.paymentAccountId && targets.some((t) => t.id === a.paymentAccountId),
  );
  const ids = [...targets, ...cardsWithBilling].map((a) => a.id);
  const since = addDays(opts.today, -DAILY_SPEND_LOOKBACK_DAYS);
  const [{ snapshots, flows }, rules, spend] = await Promise.all([
    getAccountFlows(ctx, ids, opts.today),
    getRecurringRules(ctx),
    prisma.transaction.groupBy({
      by: ["fromAccountId"],
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        type: "EXPENSE",
        isFixed: false,
        recurringRuleId: null,
        fromAccountId: { in: ids },
        date: { gt: toDbDate(since), lte: toDbDate(opts.today) },
      },
      _sum: { amount: true },
    }),
  ]);
  const balances = computeBalances(ids, snapshots, flows, opts.today);
  // 기록을 시작한 지 90일이 안 됐으면 그 기간으로 나눈다 (가입 첫 주에 하루 평균이 1/90 로 작아지지 않게)
  const trackingStart = snapshots.reduce<DateStr | null>((m, s) => (m === null || s.asOf < m ? s.asOf : m), null);
  const spanDays = Math.max(
    7,
    Math.min(DAILY_SPEND_LOOKBACK_DAYS, trackingStart ? Math.round((Date.parse(opts.today) - Date.parse(trackingStart)) / 86_400_000) : DAILY_SPEND_LOOKBACK_DAYS),
  );
  const daily = new Map(spend.map((s) => [s.fromAccountId, (s._sum.amount ?? 0n) / BigInt(spanDays)]));

  const forecastAccounts: ForecastAccount[] = targets.map((a) => ({
    id: a.id,
    name: a.name,
    balance: balances.get(a.id) ?? 0n,
    dailySpend: daily.get(a.id) ?? 0n,
  }));
  const forecastCards: ForecastCard[] = cardsWithBilling.map((c) => {
    const b = balances.get(c.id) ?? 0n;
    return {
      id: c.id,
      name: c.name,
      billingDay: c.billingDay!,
      paymentAccountId: c.paymentAccountId!,
      unpaid: b < 0n ? -b : 0n,
      dailySpend: daily.get(c.id) ?? 0n,
    };
  });
  const forecastRules: ForecastRule[] = rules
    .filter((r) => r.isActive)
    .map((r) => ({
      name: r.name,
      type: r.template.type,
      amount: BigInt(r.template.amount),
      fromAccountId: r.template.fromAccountId,
      toAccountId: r.template.toAccountId,
      dayOfMonth: r.dayOfMonth,
      businessDayAdjust: r.businessDayAdjust,
      startDate: r.startDate,
      endDate: r.endDate,
      lastRunOn: r.lastRunOn,
    }));
  const input = { accounts: forecastAccounts, rules: forecastRules, cards: forecastCards, today: opts.today };
  const saveFirst = suggestSaveFirst(input);
  const idle = findIdleMoney(input, { saveFirst });
  return forecastBalances(input).map((f) => ({
    ...f,
    saveFirst: saveFirst.find((s) => s.accountId === f.id) ?? null,
    idle: idle.find((s) => s.accountId === f.id) ?? null,
  }));
}
