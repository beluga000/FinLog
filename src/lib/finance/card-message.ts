import { toDateStr } from "./period";
import type { DateStr } from "./types";

/**
 * 카드 승인 문자·알림 파서 (PROD.MD §2-5 모바일 수집, AC-21).
 * 카드사마다 줄바꿈·순서가 조금씩 달라 고정 양식 대신 공통 조각을 찾는다:
 *   카드사명 · 승인/취소 · 금액(…원, 누적·잔액 제외) · 일시불/N개월 · MM/DD HH:mm · 가맹점
 * 클라이언트에서만 실행하고 원문은 저장하지 않는다.
 */

export interface ParsedCardMessage {
  kind: "approval" | "cancel" | "unknown";
  amount: bigint | null;
  date: DateStr | null;
  merchant: string | null;
  issuer: string | null;
  /** 할부 개월 (일시불 = 1) */
  installment: number | null;
}

const ISSUERS: [RegExp, string][] = [
  [/신한/, "신한카드"],
  [/KB|국민/, "KB국민카드"],
  [/현대/, "현대카드"],
  [/삼성/, "삼성카드"],
  [/롯데/, "롯데카드"],
  [/우리/, "우리카드"],
  [/하나/, "하나카드"],
  [/비씨|BC/i, "BC카드"],
  [/농협|NH/, "NH농협카드"],
  [/씨티|citi/i, "씨티카드"],
  [/카카오/, "카카오뱅크"],
  [/토스/, "토스뱅크"],
];

/** 가맹점이 될 수 없는 줄 — 이름(마스킹)·누적·잔액·카드사 머리글 */
const NOT_MERCHANT = /누적|잔액|승인|취소|원$|^\[|님$|\*/;

export function parseCardMessage(raw: string, today: DateStr): ParsedCardMessage {
  const text = raw.replace(/\[Web발신\]/g, "").replace(/\r/g, "").trim();
  const result: ParsedCardMessage = { kind: "unknown", amount: null, date: null, merchant: null, issuer: null, installment: null };
  if (!text) return result;

  result.kind = /취소/.test(text) ? "cancel" : /승인|결제|사용/.test(text) ? "approval" : "unknown";
  result.issuer = ISSUERS.find(([re]) => re.test(text))?.[1] ?? null;

  // 누적·잔액 금액을 지운 뒤 첫 금액이 결제 금액
  const withoutTotals = text.replace(/(누적|잔액|한도)\s*[:]?\s*-?[\d,]+\s*원/g, "");
  const amount = withoutTotals.match(/([\d]{1,3}(?:,\d{3})+|\d+)\s*원/);
  if (amount) result.amount = BigInt(amount[1].replace(/,/g, ""));

  const inst = text.match(/일시불|(\d{1,2})\s*개월/);
  if (inst) result.installment = inst[1] ? Number(inst[1]) : 1;

  const dt = text.match(/(\d{1,2})[/.-](\d{1,2})\s*(\d{1,2}:\d{2})?/);
  if (dt) {
    const month = Number(dt[1]);
    const day = Number(dt[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const [ty] = today.split("-").map(Number);
      // 오늘보다 뒤 날짜면 작년 문자 (1월에 받은 12월 문자 등)
      const candidate = toDateStr(ty, month, day);
      result.date = candidate > today ? toDateStr(ty - 1, month, day) : candidate;
    }
  }

  result.merchant = findMerchant(text, dt);
  return result;
}

function findMerchant(text: string, dt: RegExpMatchArray | null): string | null {
  const clean = (s: string) =>
    s
      .replace(/(누적|잔액|한도)\s*[:]?\s*-?[\d,]+\s*원.*/, "")
      .replace(/일시불|\d{1,2}\s*개월/, "")
      .trim();
  // 1) 날짜·시각 바로 뒤에 같은 줄로 붙은 가맹점 ("10/30 14:22 스타벅스")
  if (dt && dt.index !== undefined) {
    const rest = text.slice(dt.index + dt[0].length).split("\n");
    const sameLine = clean(rest[0]);
    if (sameLine && !NOT_MERCHANT.test(sameLine)) return sameLine;
    // 2) 날짜 다음 줄
    for (const line of rest.slice(1)) {
      const c = clean(line);
      if (c && !NOT_MERCHANT.test(c) && !/^[\d,\s]+$/.test(c)) return c;
    }
  }
  return null;
}
