/** 원 단위 금액 유틸. 금액은 항상 bigint(원)로 다루고, 표시 직전에만 문자열로 바꾼다. */

const krw = new Intl.NumberFormat("ko-KR");

export function formatKRW(value: bigint | number, opts: { sign?: boolean } = {}): string {
  const v = typeof value === "bigint" ? value : BigInt(Math.round(value));
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const body = `₩${krw.format(abs)}`;
  if (neg) return `-${body}`;
  return opts.sign && v > 0n ? `+${body}` : body;
}

/** 축약 표기: 1.2억, 123.4만, 9,800원 */
export function formatCompactKRW(value: bigint | number): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${sign}${trimZero((abs / 1e8).toFixed(abs >= 1e10 ? 0 : 1))}억`;
  if (abs >= 1e4) return `${sign}${trimZero((abs / 1e4).toFixed(abs >= 1e7 ? 0 : 1))}만`;
  return `${sign}${krw.format(Math.round(abs))}원`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function sumBigInt(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** "1,234,000" / "1234000" / "₩1,234" → 1234000n. 숫자가 아니면 null. */
export function parseWon(input: string): bigint | null {
  const cleaned = input.replace(/[₩,\s원]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  return BigInt(cleaned);
}

/** 분자/분모 비율 (분모 0이면 null) — 표시용 number */
export function ratio(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(digits)}%`;
}
