import { z } from "zod";
import { MAX_INSTALLMENT_MONTHS } from "@/lib/finance/installments";

export const TX_TYPE_VALUES = ["INCOME", "EXPENSE", "TRANSFER", "SAVE_INVEST", "LOAN_REPAY", "ADJUSTMENT"] as const;
export const VISIBILITY_VALUES = ["SHARED", "SUMMARY_ONLY", "PRIVATE"] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");
const optionalId = z.string().min(1).nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

/** 금액: 원 단위 양의 정수 문자열 (최대 10조) */
export const amountStr = z
  .string()
  .regex(/^\d+$/, "금액은 숫자만 입력하세요.")
  .refine((v) => BigInt(v) > 0n, "금액은 0보다 커야 합니다.")
  .refine((v) => BigInt(v) < 10n ** 13n, "금액이 너무 큽니다.");

export const txInputSchema = z.object({
  type: z.enum(TX_TYPE_VALUES),
  date: dateStr,
  amount: amountStr,
  fromAccountId: optionalId,
  toAccountId: optionalId,
  categoryId: optionalId,
  merchant: optionalText(100),
  memo: optionalText(500),
  /** null 이면 계좌 기본 공개범위를 따른다 */
  visibility: z.enum(VISIBILITY_VALUES).nullable(),
  isFixed: z.boolean(),
  /** 신용카드 할부 개월. 없거나 1 이하면 일시불 */
  installmentMonths: z
    .number()
    .int()
    .max(MAX_INSTALLMENT_MONTHS, `할부는 ${MAX_INSTALLMENT_MONTHS}개월까지예요.`)
    .nullish()
    .transform((v) => (v && v >= 2 ? v : null)),
});

export type TxInput = z.input<typeof txInputSchema>;

export const recurringInputSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50),
  tx: txInputSchema.omit({ date: true, installmentMonths: true }),
  dayOfMonth: z.number().int().min(0).max(31),
  businessDayAdjust: z.enum(["NONE", "PREV", "NEXT"]),
  startDate: dateStr,
  endDate: dateStr.nullable(),
});

export type RecurringInput = z.input<typeof recurringInputSchema>;

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
