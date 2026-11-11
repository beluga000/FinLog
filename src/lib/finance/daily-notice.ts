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
