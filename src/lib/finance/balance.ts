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

/**
 * 여러 날짜의 잔액을 한 번에 — 날짜마다 computeBalances 를 다시 돌리면 (날짜 수 × 거래 수)지만,
 * 스냅샷·거래를 날짜순으로 한 번만 훑으며 누적한다. 결과는 dates 와 같은 순서이고
 * 각 날짜의 값은 computeBalances(accountIds, snapshots, txs, date) 와 같다.
 */
export function balanceSeries(
  accountIds: string[],
  snapshots: BalanceSnapshot[],
  txs: FlowTx[],
  dates: DateStr[],
): Map<string, bigint>[] {
  const tracked = new Set(accountIds);
  const bal = new Map<string, bigint>();
  for (const id of accountIds) bal.set(id, 0n);

  // 같은 날은 거래 → 스냅샷 순: 스냅샷은 그날 마감 잔액이라 그날까지의 거래를 덮어쓴다
  const snaps = snapshots.filter((s) => tracked.has(s.accountId)).sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  const flows = txs.filter((t) => (t.toAccountId && tracked.has(t.toAccountId)) || (t.fromAccountId && tracked.has(t.fromAccountId)));
  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const order = dates.map((d, i) => ({ d, i })).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const out: Map<string, bigint>[] = new Array(dates.length);
  let fi = 0;
  let si = 0;
  for (const { d, i } of order) {
    while (fi < flows.length || si < snaps.length) {
      const f = flows[fi];
      const s = snaps[si];
      const fDue = f !== undefined && f.date <= d;
      const sDue = s !== undefined && s.asOf <= d;
      if (fDue && (!sDue || f.date <= s.asOf)) {
        if (f.toAccountId && tracked.has(f.toAccountId)) bal.set(f.toAccountId, bal.get(f.toAccountId)! + f.amount);
        if (f.fromAccountId && tracked.has(f.fromAccountId)) bal.set(f.fromAccountId, bal.get(f.fromAccountId)! - f.amount);
        fi++;
      } else if (sDue) {
        bal.set(s.accountId, s.balance);
        si++;
      } else break;
    }
    out[i] = new Map(bal);
  }
  return out;
}

export interface NetWorth {
  assets: bigint;
  liabilities: bigint;
  netWorth: bigint;
  /** 순자산에서 뺀 보증금 대출 잔액 (양수) */
  depositLoans: bigint;
}

/**
 * 순자산 = 자산 − 부채.
 * 전세·월세 보증금 대출(depositLoan)은 보증금으로 묶여 있어 내가 쓰는 돈이 아니므로 부채에서 뺀다
 * — 대신 보증금 자산에는 내 돈으로 낸 몫만 넣는다(대출로 낸 몫까지 넣으면 순자산이 부풀려진다).
 */
export function summarizeNetWorth(
  accounts: { id: string; type: AccountType; depositLoan?: boolean }[],
  balances: Map<string, bigint>,
): NetWorth {
  let assets = 0n;
  let liabilities = 0n;
  let depositLoans = 0n;
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0n;
    if (a.type === "LOAN" && a.depositLoan) depositLoans += -b;
    else if (isLiability(a.type)) liabilities += -b;
    else assets += b;
  }
  return { assets, liabilities, netWorth: assets - liabilities, depositLoans };
}
