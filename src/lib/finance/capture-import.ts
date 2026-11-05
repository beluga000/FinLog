import type { CaptureItem, CaptureResult } from "./card-capture";
import { cleanMerchant } from "./merchant-match";
import type { AccountType } from "./types";

/**
 * 결제내역 캡처 → 여러 건 지출 기록의 순수 함수들 (PROD.MD §2-5 모바일 수집).
 * 화면(브라우저)과 서버 액션이 함께 쓴다. 인식 원문 줄(lines)은 여기서도 서버로 넘기지 않는다.
 */

/** 합친 후보 한 건 — 어느 캡처의 카드사에서 왔는지 함께 둔다 */
export interface CaptureCandidate extends CaptureItem {
  issuer: string | null;
}

/** 같은 건인지 보는 열쇠: 날짜 + 금액 + 가맹점(공백·대소문자 무시) + 승인/취소 */
export function captureItemKey(item: Pick<CaptureItem, "date" | "amount" | "merchant" | "status">): string {
  const merchant = cleanMerchant(item.merchant ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return `${item.date ?? ""}|${item.amount}|${merchant}|${item.status}`;
}

/**
 * 여러 장의 인식 결과를 합친다.
 * 겹치게 찍은 캡처에 같은 건이 또 나오면 한 번만 남긴다. 다만 한 장 안에 같은 건이 두 번 있으면
 * (같은 날 같은 곳에서 같은 금액을 두 번 결제) 실제로 두 번 쓴 것이므로 둘 다 남긴다 —
 * 같은 열쇠의 건 수는 "장마다 센 개수 중 가장 큰 값"이 된다.
 */
export function mergeCaptureResults(results: readonly Pick<CaptureResult, "issuer" | "items">[]): CaptureCandidate[] {
  const kept = new Map<string, number>();
  const out: CaptureCandidate[] = [];
  for (const r of results) {
    const local = new Map<string, number>();
    for (const item of r.items) {
      const key = captureItemKey(item);
      const n = (local.get(key) ?? 0) + 1;
      local.set(key, n);
      if (n > (kept.get(key) ?? 0)) {
        kept.set(key, n);
        out.push({ ...item, issuer: r.issuer });
      }
    }
  }
  return out;
}

/** 등록 안 한 건도 겹친 캡처에서 두 번 나오지 않게 (같은 열쇠·같은 사유는 한 번만) */
export function mergeRejected(results: readonly Pick<CaptureResult, "rejected">[]): CaptureResult["rejected"] {
  const seen = new Set<string>();
  const out: CaptureResult["rejected"] = [];
  for (const r of results) {
    for (const x of r.rejected) {
      const key = `${captureItemKey(x.item)}#${x.reasons.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
    }
  }
  return out;
}

export interface ImportKeyRow {
  date: string;
  amount: bigint | string;
  merchant: string | null;
  accountId: string | null;
}

/**
 * 가져오기 중복 방지 열쇠 (해시 전 원문). `householdId|날짜|금액|사용처|계좌|순번`.
 * 순번은 한 번에 저장하는 건들 중 앞의 다섯 값이 같은 건끼리 0, 1, 2 … —
 * 같은 캡처를 다시 가져오면 같은 열쇠가 나와 건너뛰고, 한 캡처 안의 똑같은 두 건은 둘 다 저장된다.
 */
export function importKeys(householdId: string, rows: readonly ImportKeyRow[]): string[] {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const base = [householdId, r.date, r.amount.toString(), (r.merchant ?? "").trim(), r.accountId ?? ""].join("|");
    const ordinal = counts.get(base) ?? 0;
    counts.set(base, ordinal + 1);
    return `${base}|${ordinal}`;
  });
}

export interface IssuerAccount {
  id: string;
  name: string;
  type: AccountType;
  institution?: string | null;
}

/**
 * 캡처의 카드사 → 결제 수단. 금융사가 정확히 같으면 가장 먼저, 다음은 금융사·이름에 카드사명(신한·KB국민 …)이
 * 들어간 계좌. 같은 점수면 신용카드를 고른다. 대출 계좌는 지출의 결제 수단이 될 수 없어 뺀다.
 */
export function matchIssuerAccount(issuer: string | null, accounts: readonly IssuerAccount[]): string | null {
  if (!issuer) return null;
  const short = issuer.replace(/카드|뱅크|은행/g, "").trim();
  if (!short) return null;
  let best: { id: string; score: number } | null = null;
  for (const a of accounts) {
    if (a.type === "LOAN") continue;
    const inst = a.institution ?? "";
    let score = inst === issuer ? 3 : inst.includes(short) ? 2 : a.name.includes(short) ? 1 : 0;
    if (!score) continue;
    if (a.type === "CREDIT_CARD") score += 0.5;
    if (!best || score > best.score) best = { id: a.id, score };
  }
  return best?.id ?? null;
}
