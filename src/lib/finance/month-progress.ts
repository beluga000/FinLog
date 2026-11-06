import { addDays } from "./period";
import { nextDueDate, type RecurringSchedule } from "./recurring";
import type { DateStr, TxType } from "./types";

/**
 * 진행 중인 달 리포트 (월초에 "수입 0원 · 100% 감소"처럼 겁주지 않기).
 * - 지난달은 한 달 전체가 아니라 같은 날짜까지만 비교한다.
 * - 정기 규칙으로 아는 남은 수입·저축은 "예정"으로 함께 보여 준다.
 */

type Range = { start: DateStr; end: DateStr };

function daysBetween(from: DateStr, to: DateStr): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * 지난달 같은 기간 — 이번 달 시작일부터 오늘까지 지난 날 수만큼 지난달 시작일부터 센다 (end 는 미포함).
 * 오늘이 이번 달 범위 밖이면(끝난 달) null.
 */
export function samePeriodRange(current: Range, previous: Range, today: DateStr): Range | null {
  if (today < current.start || today >= current.end) return null;
  const end = addDays(previous.start, daysBetween(current.start, today) + 1);
  return { start: previous.start, end: end < previous.end ? end : previous.end };
}

export interface PlannedRule extends RecurringSchedule {
  name: string;
  type: TxType;
  amount: bigint;
  isActive: boolean;
  lastRunOn: DateStr | null;
}

export interface PlannedItem {
  name: string;
  type: TxType;
  amount: bigint;
  date: DateStr;
}

/** 오늘 뒤로 이번 달 안에 생성될 정기 거래 (날짜순). 이미 생성된 회차는 lastRunOn 으로 건너뛴다. */
export function upcomingPlanned(rules: PlannedRule[], today: DateStr, range: Range): PlannedItem[] {
  return rules
    .filter((r) => r.isActive)
    .flatMap((r) => {
      const date = nextDueDate(r, r.lastRunOn, today);
      return date && date < range.end ? [{ name: r.name, type: r.type, amount: r.amount, date }] : [];
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface PlannedSummary {
  income: bigint;
  /** 저축·투자 + 원금 상환 */
  saving: bigint;
  /** 가장 큰 예정 수입의 날짜 — "25일 월급" 안내용 */
  incomeDate: DateStr | null;
  savingDate: DateStr | null;
}

export function summarizePlanned(items: PlannedItem[]): PlannedSummary {
  const incomes = items.filter((i) => i.type === "INCOME");
  const savings = items.filter((i) => i.type === "SAVE_INVEST" || i.type === "LOAN_REPAY");
  const biggest = (list: PlannedItem[]) => list.reduce<PlannedItem | null>((top, i) => (!top || i.amount > top.amount ? i : top), null);
  return {
    income: incomes.reduce((s, i) => s + i.amount, 0n),
    saving: savings.reduce((s, i) => s + i.amount, 0n),
    incomeDate: biggest(incomes)?.date ?? null,
    savingDate: biggest(savings)?.date ?? null,
  };
}
