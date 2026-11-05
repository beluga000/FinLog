import type { TxType } from "@/lib/finance/types";

/** 마지막에 쓴 계좌·최근 카테고리 — 이 브라우저에만 저장 (거래 입력·캡처로 기록 공용) */

const LAST_ACCOUNT_KEY = "finlog:last-account";

export function readLastAccounts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberAccount(key: string, id: string | null) {
  if (!id) return;
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify({ ...readLastAccounts(), [key]: id }));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

/** 유형별 최근 쓴 카테고리 (최신이 앞) — 간편 입력의 카테고리 버튼 순서와 기본 선택에 쓴다 */
const RECENT_CATEGORY_KEY = "finlog:recent-categories";
const RECENT_CATEGORY_MAX = 6;

export function readRecentCategories(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_CATEGORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberCategory(type: TxType, id: string | null) {
  if (!id) return;
  try {
    const all = readRecentCategories();
    const next = [id, ...(all[type] ?? []).filter((c) => c !== id)].slice(0, RECENT_CATEGORY_MAX);
    localStorage.setItem(RECENT_CATEGORY_KEY, JSON.stringify({ ...all, [type]: next }));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}
