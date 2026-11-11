/**
 * 가계부 검색어 — 사용처·메모·카테고리 글자, 또는 금액(숫자만, 쉼표·"원" 허용).
 * 화면(이번 달 바로 거르기)과 서버(전체 기간 찾기)가 같은 해석을 쓴다.
 */

export type TxQuery = { text: string; amount: bigint | null } | null;

const MAX = 50;

export function parseTxQuery(raw: string): TxQuery {
  const q = raw.trim().slice(0, MAX);
  if (!q) return null;
  const digits = q.replace(/[,\s]/g, "").replace(/원$/, "");
  const amount = /^\d{1,13}$/.test(digits) && BigInt(digits) > 0n ? BigInt(digits) : null;
  return { text: q, amount };
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 글자는 공백·대소문자 무시하고 포함, 숫자 검색어는 금액이 같거나 글자에 들어 있으면 */
export function matchesTxQuery(
  tx: { merchant: string | null; memo: string | null; categoryName: string | null; amount: bigint },
  q: NonNullable<TxQuery>,
): boolean {
  if (q.amount !== null && tx.amount === q.amount) return true;
  const needle = norm(q.text);
  if (!needle) return false;
  return [tx.merchant, tx.memo, tx.categoryName].some((v) => v !== null && norm(v).includes(needle));
}
