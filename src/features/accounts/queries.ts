import "server-only";
import { getAccountFlows, getAccounts, type AccountRow } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { computeBalances, summarizeNetWorth, type NetWorth } from "@/lib/finance/balance";
import { addDays, getMonthRange, shiftMonth, getMonthKey } from "@/lib/finance/period";
import type { DateStr, MonthKey } from "@/lib/finance/types";
import type { ViewScope } from "@/lib/finance/visibility";

type Ctx = Pick<HouseholdContext, "householdId" | "userId">;

export interface AccountWithBalance extends AccountRow {
  balance: bigint;
}

export interface NetWorthPoint extends NetWorth {
  month: MonthKey;
  asOf: DateStr;
}

/** 보이는 계좌 + 현재 잔액 + 월말 순자산 추이 */
export async function getAccountOverview(
  ctx: Ctx,
  scope: ViewScope,
  opts: { today: DateStr; monthStartDay: number; trendMonths?: number },
) {
  const accounts = await getAccounts(ctx, scope);
  const ids = accounts.map((a) => a.id);
  const { snapshots, flows } = await getAccountFlows(ctx, ids, opts.today);
  const balances = computeBalances(ids, snapshots, flows, opts.today);
  const withBalance: AccountWithBalance[] = accounts.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0n }));

  const trendMonths = opts.trendMonths ?? 12;
  const current = getMonthKey(opts.today, opts.monthStartDay);
  // 기록 시작(가장 이른 잔액 스냅샷) 이전 달은 0원이 아니라 "데이터 없음"이므로 제외
  const trackingStart = snapshots.reduce<DateStr | null>((min, s) => (min === null || s.asOf < min ? s.asOf : min), null);
  const trend: NetWorthPoint[] = [];
  for (let i = trendMonths - 1; i >= 0; i--) {
    const month = shiftMonth(current, -i);
    const { end } = getMonthRange(month, opts.monthStartDay);
    const asOf = i === 0 ? opts.today : addDays(end, -1);
    if (i > 0 && (trackingStart === null || asOf < trackingStart)) continue;
    const b = computeBalances(ids, snapshots, flows, asOf);
    trend.push({ month, asOf, ...summarizeNetWorth(accounts, b) });
  }

  return { accounts: withBalance, netWorth: summarizeNetWorth(accounts, balances), trend };
}
