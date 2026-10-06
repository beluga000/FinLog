import type { AccountType, LedgerTx, Visibility } from "./types";

/**
 * 부부 모드 공개범위 (PROD.MD §1-3).
 *
 * | 작성자   | SHARED          | SUMMARY_ONLY        | PRIVATE |
 * |----------|-----------------|---------------------|---------|
 * | 나       | 전체            | 전체                | 전체    |
 * | 배우자   | 전체            | 합계에만 반영(건별X) | 제외    |
 *
 * 뷰 스코프:
 * - us      : 가구 전체 (내 것 + 배우자 공개분)
 * - me      : 내가 작성한 것만
 * - partner : 배우자의 공개분만
 *
 * 반드시 서버에서 적용한다. summarized 항목은 id·메모·가맹점이 제거된 형태라 목록 API로 내보낼 수 없다.
 */

export type ViewScope = "us" | "me" | "partner";

export const VIEW_SCOPES: ViewScope[] = ["us", "me", "partner"];

export function parseViewScope(value: unknown): ViewScope {
  return VIEW_SCOPES.includes(value as ViewScope) ? (value as ViewScope) : "us";
}

/** 합계 계산에만 쓰이는 축소 거래 — 건별로 식별 가능한 필드가 없다 */
export interface SummaryTx {
  type: LedgerTx["type"];
  amount: bigint;
  categoryId: string | null;
  date: string;
  isFixed: boolean;
}

export type TxAccess = "full" | "summary" | "none";

export function txAccess(
  tx: Pick<LedgerTx, "createdByUserId" | "visibility">,
  viewerUserId: string,
  scope: ViewScope,
): TxAccess {
  const mine = tx.createdByUserId === viewerUserId;
  if (mine) return scope === "partner" ? "none" : "full";
  if (scope === "me") return "none";
  if (tx.visibility === "SHARED") return "full";
  if (tx.visibility === "SUMMARY_ONLY") return "summary";
  return "none";
}

export function toSummaryTx(tx: SummaryTx): SummaryTx {
  return {
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    date: tx.date,
    isFixed: tx.isFixed,
  };
}

export function scopeTransactions<T extends LedgerTx>(
  txs: T[],
  viewerUserId: string,
  scope: ViewScope,
): { items: T[]; summarized: SummaryTx[] } {
  const items: T[] = [];
  const summarized: SummaryTx[] = [];
  for (const tx of txs) {
    const access = txAccess(tx, viewerUserId, scope);
    if (access === "full") items.push(tx);
    else if (access === "summary") summarized.push(toSummaryTx(tx));
  }
  return { items, summarized };
}

export interface ScopableAccount {
  ownerUserId: string | null;
  defaultVisibility: Visibility;
  type: AccountType;
}

/**
 * 계좌 공개범위: 공동 명의(owner=null)는 둘 다 본다.
 * 배우자 명의 PRIVATE 계좌는 존재 자체가 숨겨진다.
 */
export function canSeeAccount(account: ScopableAccount, viewerUserId: string, scope: ViewScope): boolean {
  const owner = account.ownerUserId;
  const mine = owner === viewerUserId;
  const joint = owner === null;
  if (scope === "me") return mine;
  if (scope === "partner") return !mine && !joint && account.defaultVisibility !== "PRIVATE";
  return mine || joint || account.defaultVisibility !== "PRIVATE";
}
