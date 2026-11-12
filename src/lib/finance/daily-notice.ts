import { formatCompactKRW } from "./money";
import type { DateStr } from "./types";

/** 하루 한 번 보내는 알림 — 잔액 부족 예보(가까운 것) + 확인할 일. 보낼 게 없으면 null */
export interface DailyNotice {
  title: string;
  body: string;
  /** 누르면 열 화면 */
  url: string;
  /** 같은 종류 알림은 새것으로 바꿔 끼운다 (쌓이지 않게) */
  tag: string;
}

/** 푸시로 알리는 잔액 부족은 이만큼 앞까지만 — 홈 카드(2주)보다 짧게, 매일 같은 말을 오래 반복하지 않게 */
export const PUSH_SHORTFALL_DAYS = 3;

const dayLabel = (date: DateStr, today: DateStr) => {
  if (date === today) return "오늘";
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return date === tomorrow ? "내일" : `${Number(date.slice(8, 10))}일`;
};

export function composeDailyNotice(input: {
  today: DateStr;
  shortfalls: { date: DateStr; accountName: string; amount: bigint; cause: string | null }[];
  reviewCount: number;
}): DailyNotice | null {
  const short = [...input.shortfalls].sort((a, b) => a.date.localeCompare(b.date))[0];
  const review = input.reviewCount > 0 ? `확인할 기록 ${input.reviewCount}건` : null;
  if (short) {
    const when = dayLabel(short.date, input.today);
    return {
      title: `${short.accountName} ${when} ${formatCompactKRW(short.amount)} 모자랄 것 같아요`,
      body: [short.cause ? `${short.cause} 때문이에요. 미리 옮겨 두세요.` : "미리 옮겨 두세요.", review].filter(Boolean).join(" · "),
      url: "/dashboard",
      tag: "daily",
    };
  }
  if (review) {
    return { title: `정기 거래로 자동 기록된 ${input.reviewCount}건이 있어요`, body: "금액이 맞는지 확인해 주세요.", url: "/dashboard", tag: "daily" };
  }
  return null;
}

// ───────────────────────── 일이 생겼을 때 알림 ─────────────────────────
// 아침 알림과 함께 보내되 종류마다 tag 가 달라 따로 뜬다. 상태 없이 매일 돌기 때문에
// "그날만 해당하는 조건"(결제 이틀 전·당일, 어제 처음 넘은 선)으로 같은 말을 반복하지 않는다.

/** 쓸 수 있는 돈을 이만큼 쓰면 한 번 알린다 */
export const SPENDABLE_WARN_RATIO = 0.8;

/**
 * 어제까지 쓴 비율이 그 전날보다 선(80%·100%)을 처음 넘었으면 그 단계. 생활비가 0 이하이면(계획이 없으면) 알리지 않는다.
 */
export function spendableCrossing(before: number | null, after: number | null): "warn" | "over" | null {
  if (before === null || after === null) return null;
  if (before < 1 && after >= 1) return "over";
  if (before < SPENDABLE_WARN_RATIO && after >= SPENDABLE_WARN_RATIO) return "warn";
  return null;
}

export interface CardDueNotice {
  cardId: string;
  cardName: string;
  date: DateStr;
  toPay: bigint;
  paymentName: string | null;
  /** 출금 계좌 잔액이 모자라는 금액 (모르면 null) */
  shortBy: bigint | null;
}

const daysBetween = (from: DateStr, to: DateStr) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function composeEventNotices(input: {
  today: DateStr;
  cardDues: CardDueNotice[];
  spendable: { level: "warn" | "over"; remaining: bigint } | null;
  milestones: { goalId: string; name: string; percent: number }[];
}): DailyNotice[] {
  const out: DailyNotice[] = [];
  for (const c of input.cardDues) {
    const d = daysBetween(input.today, c.date);
    // 결제 이틀 전과 당일 아침에만 (그 사이는 홈 확인할 일에 계속 보인다)
    if ((d !== 2 && d !== 0) || c.toPay <= 0n) continue;
    const when = d === 0 ? "오늘" : "모레";
    const from = c.paymentName ? `${c.paymentName}에서 빠져요.` : "출금 계좌를 확인하세요.";
    const short = c.shortBy && c.shortBy > 0n ? ` ${formatCompactKRW(c.shortBy)} 모자라요 — 미리 옮겨 두세요.` : "";
    out.push({ title: `${c.cardName} 카드값 ${when} ${formatCompactKRW(c.toPay)}`, body: `${from}${short}`, url: "/dashboard", tag: `card-${c.cardId}` });
  }
  if (input.spendable) {
    const { level, remaining } = input.spendable;
    out.push(
      level === "over"
        ? { title: "이번 달 쓸 수 있는 돈을 넘었어요", body: `${formatCompactKRW(-remaining)} 더 썼어요. 리포트에서 어디서 늘었는지 볼 수 있어요.`, url: "/reports", tag: "spendable" }
        : { title: `이번 달 쓸 수 있는 돈의 ${Math.round(SPENDABLE_WARN_RATIO * 100)}%를 썼어요`, body: `남은 돈 ${formatCompactKRW(remaining)}이에요.`, url: "/dashboard", tag: "spendable" },
    );
  }
  for (const m of input.milestones) {
    out.push({
      title: m.percent >= 100 ? `${m.name} 목표 금액을 다 모았어요!` : `${m.name} ${m.percent}% 모였어요`,
      body: m.percent >= 100 ? "목표 화면에서 달성으로 표시해 보세요." : "지금 페이스를 보러 가요.",
      url: `/goals/${m.goalId}`,
      tag: `goal-${m.goalId}`,
    });
  }
  return out;
}
