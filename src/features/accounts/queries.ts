import "server-only";
import { getAccountFlows, getAccounts, type AccountRow } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { fromDbDate, prisma } from "@/lib/db/prisma";
import { balanceSeries, computeBalances, summarizeNetWorth, type NetWorth } from "@/lib/finance/balance";
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

  const trendMonths = opts.trendMonths ?? 12;
  const current = getMonthKey(opts.today, opts.monthStartDay);
  // 기록 시작(가장 이른 잔액 스냅샷) 이전 달은 0원이 아니라 "데이터 없음"이므로 제외
  const trackingStart = snapshots.reduce<DateStr | null>((min, s) => (min === null || s.asOf < min ? s.asOf : min), null);
  const points: { month: MonthKey; asOf: DateStr }[] = [];
  for (let i = trendMonths - 1; i >= 0; i--) {
    const month = shiftMonth(current, -i);
    const { end } = getMonthRange(month, opts.monthStartDay);
    const asOf = i === 0 ? opts.today : addDays(end, -1);
    if (i > 0 && (trackingStart === null || asOf < trackingStart)) continue;
    points.push({ month, asOf });
  }
  // 마지막 점이 오늘이므로 현재 잔액도 같은 계산에서 나온다
  const series = balanceSeries(ids, snapshots, flows, points.map((p) => p.asOf));
  const balances = series[series.length - 1];
  const trend: NetWorthPoint[] = points.map((p, i) => ({ ...p, ...summarizeNetWorth(accounts, series[i]) }));
  const withBalance: AccountWithBalance[] = accounts.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0n }));

  return { accounts: withBalance, balances, netWorth: summarizeNetWorth(accounts, balances), trend };
}

export interface ReconcileAccount {
  id: string;
  name: string;
  type: AccountRow["type"];
  institution: string | null;
  depositLoan: boolean;
  balanceCheckYearly: boolean;
  /** 앱이 계산한 지금 잔액 (저장 기준 — 부채는 음수) */
  balance: bigint;
  /** 마지막으로 잔액을 입력한 날 (없으면 null) */
  last: DateStr | null;
}

/** 잔액 한 번에 맞추기 대상 — 내가 볼 수 있는 사용 중인 계좌 전부, 계좌 종류 순 */
export async function getReconcileAccounts(ctx: Ctx, opts: { today: DateStr }): Promise<ReconcileAccount[]> {
  const accounts = await getAccounts(ctx, "us");
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);
  const [{ snapshots, flows }, lastSnapshots] = await Promise.all([
    getAccountFlows(ctx, ids, opts.today),
    prisma.accountSnapshot.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _max: { asOf: true } }),
  ]);
  const balances = computeBalances(ids, snapshots, flows, opts.today);
  const lastById = new Map(lastSnapshots.map((s) => [s.accountId, s._max.asOf ? fromDbDate(s._max.asOf) : null]));
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    depositLoan: a.depositLoan,
    balanceCheckYearly: a.balanceCheckYearly,
    balance: balances.get(a.id) ?? 0n,
    last: lastById.get(a.id) ?? null,
  }));
}
