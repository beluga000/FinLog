import { nextDueDate } from "@/lib/finance/recurring";
import type { DateStr, TxType } from "@/lib/finance/types";
import type { RecurringTemplate } from "./queries";

/** 정기 거래 화면 묶음 — 이체는 합계(남는 돈)에 넣지 않는다 */
export type RecurringGroup = "INCOME" | "EXPENSE" | "SAVING" | "TRANSFER";

export const RECURRING_GROUPS: { key: RecurringGroup; label: string }[] = [
  { key: "INCOME", label: "수입" },
  { key: "EXPENSE", label: "지출" },
  { key: "SAVING", label: "저축·투자·상환" },
  { key: "TRANSFER", label: "이체" },
];

export function groupOf(type: TxType): RecurringGroup {
  if (type === "INCOME") return "INCOME";
  if (type === "EXPENSE") return "EXPENSE";
  if (type === "SAVE_INVEST" || type === "LOAN_REPAY") return "SAVING";
  return "TRANSFER";
}

export interface RecurringRuleInput {
  id: string;
  template: RecurringTemplate;
  dayOfMonth: number;
  businessDayAdjust: "NONE" | "PREV" | "NEXT";
  startDate: DateStr;
  endDate: DateStr | null;
  lastRunOn: DateStr | null;
  isActive: boolean;
}

function daysBetween(from: DateStr, to: DateStr): number {
  const utc = (d: DateStr) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export type RuleStatus = "active" | "paused" | "ended";

/** 중지했거나 종료일이 지난 규칙은 합계·다음 생성일에서 뺀다 */
export function ruleStatus(r: Pick<RecurringRuleInput, "isActive" | "endDate">, today: DateStr): RuleStatus {
  if (!r.isActive) return "paused";
  if (r.endDate && r.endDate < today) return "ended";
  return "active";
}

export interface RuleSchedule {
  status: RuleStatus;
  /** 다음 생성일 (진행 중일 때만) */
  next: DateStr | null;
  /** 다음 생성일까지 남은 날 (0 = 오늘) */
  dDay: number | null;
}

export function scheduleOf(r: RecurringRuleInput, today: DateStr): RuleSchedule {
  const status = ruleStatus(r, today);
  const next = status === "active" ? nextDueDate(r, r.lastRunOn, today) : null;
  return { status: next === null && status === "active" ? "ended" : status, next, dDay: next ? daysBetween(today, next) : null };
}

export interface RecurringSummary {
  income: bigint;
  expense: bigint;
  saving: bigint;
  /** 수입 − 지출 − 저축·상환 */
  remaining: bigint;
}

/** 진행 중인 규칙의 매달 합계 */
export function summarizeRecurring(rules: RecurringRuleInput[], today: DateStr): RecurringSummary {
  const sum = { INCOME: 0n, EXPENSE: 0n, SAVING: 0n, TRANSFER: 0n };
  for (const r of rules) {
    if (scheduleOf(r, today).status !== "active") continue;
    sum[groupOf(r.template.type)] += BigInt(r.template.amount);
  }
  return { income: sum.INCOME, expense: sum.EXPENSE, saving: sum.SAVING, remaining: sum.INCOME - sum.EXPENSE - sum.SAVING };
}
