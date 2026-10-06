import type { AccountType, DateStr } from "./types";

/**
 * 계좌 잔액 = 기준일 이하 최신 스냅샷 + 스냅샷 이후 거래 흐름 (PROD.MD §2-1).
 * 모든 거래는 from → to 흐름이다: toAccount 는 +amount, fromAccount 는 −amount.
 * 부채(카드·대출)는 음수 잔액으로 표현되므로 같은 규칙이 그대로 성립한다.
 *   - 카드 사용(EXPENSE, from=카드)   → 카드 잔액 더 음수
 *   - 카드대금 결제(TRANSFER, to=카드) → 0 방향으로 회복
 */

export const ASSET_TYPES: AccountType[] = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "INVESTMENT",
  "PENSION",
  "REAL_ESTATE",
  "OTHER_ASSET",
];
export const LIABILITY_TYPES: AccountType[] = ["CREDIT_CARD", "LOAN"];
/** 저축·투자(SAVE_INVEST)의 도착지가 될 수 있는 계좌 */
export const SAVING_DESTINATION_TYPES: AccountType[] = ["SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET"];

export function isLiability(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
}

export interface BalanceSnapshot {
  accountId: string;
  asOf: DateStr;
  balance: bigint;
}

export interface FlowTx {
  date: DateStr;
  amount: bigint;
  fromAccountId: string | null;
  toAccountId: string | null;
}

/** asOf 당일 거래까지 포함한 잔액. 스냅샷이 없는 계좌는 0에서 시작. */
export function computeBalances(
  accountIds: string[],
  snapshots: BalanceSnapshot[],
  txs: FlowTx[],
  asOf: DateStr,
): Map<string, bigint> {
  const base = new Map<string, { asOf: DateStr | null; balance: bigint }>();
  for (const id of accountIds) base.set(id, { asOf: null, balance: 0n });

  for (const s of snapshots) {
    const cur = base.get(s.accountId);
    if (!cur || s.asOf > asOf) continue;
    if (cur.asOf === null || s.asOf > cur.asOf) base.set(s.accountId, { asOf: s.asOf, balance: s.balance });
  }

  const result = new Map<string, bigint>();
  for (const [id, b] of base) result.set(id, b.balance);

  // 스냅샷은 해당 일자 "마감 잔액"으로 본다 → 스냅샷 당일 거래는 이미 포함된 것으로 취급
  const apply = (accountId: string | null, date: DateStr, signed: bigint) => {
    if (!accountId) return;
    const b = base.get(accountId);
    if (!b) return;
    if (date > asOf) return;
    if (b.asOf !== null && date <= b.asOf) return;
    result.set(accountId, (result.get(accountId) ?? 0n) + signed);
  };

  for (const tx of txs) {
    apply(tx.toAccountId, tx.date, tx.amount);
    apply(tx.fromAccountId, tx.date, -tx.amount);
  }
  return result;
}

export interface NetWorth {
  assets: bigint;
  liabilities: bigint;
  netWorth: bigint;
}

export function summarizeNetWorth(
  accounts: { id: string; type: AccountType }[],
  balances: Map<string, bigint>,
): NetWorth {
  let assets = 0n;
  let liabilities = 0n;
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0n;
    if (isLiability(a.type)) liabilities += -b;
    else assets += b;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}
