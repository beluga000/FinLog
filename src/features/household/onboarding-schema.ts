import { z } from "zod";
import { amountStr } from "@/features/ledger/schema";

/** 온보딩 5단계 입력 (PROD.MD §1-7). 클라이언트 초안과 서버 액션이 같은 스키마를 쓴다. */

export const GOAL_TEMPLATES = {
  HOME: { label: "주택 자금", name: "주택 자금", amount: "200000000", years: 5, expectedReturn: 0.03 },
  EMERGENCY: { label: "비상금", name: "비상금", amount: "10000000", years: 1, expectedReturn: 0.02 },
  FAMILY: { label: "결혼·출산", name: "결혼·출산 자금", amount: "50000000", years: 3, expectedReturn: 0.03 },
  CUSTOM: { label: "직접 입력", name: "", amount: "", years: 3, expectedReturn: 0.03 },
} as const;
export type GoalTemplate = keyof typeof GOAL_TEMPLATES;
export const GOAL_TEMPLATE_KEYS = Object.keys(GOAL_TEMPLATES) as GoalTemplate[];

export const ASSET_KINDS = [
  { key: "checking", label: "입출금 통장", accountName: "입출금 통장", type: "CHECKING", linkDefault: false },
  { key: "savings", label: "예적금", accountName: "예적금", type: "SAVINGS", linkDefault: true },
  { key: "investment", label: "투자·증권", accountName: "투자 계좌", type: "INVESTMENT", linkDefault: true },
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number]["key"];

/** 고정 지출 줄에서 고를 수 있는 기본 카테고리 (default-categories.ts 의 소분류·대분류 이름) */
export const FIXED_CATEGORIES = ["월세", "관리비", "공과금", "휴대폰", "인터넷·TV", "구독서비스", "보험", "대출이자", "교육", "기타지출"] as const;

const balanceStr = z.string().regex(/^\d+$/, "금액은 숫자만 입력하세요.");
const day = z.number().int().min(1, "날짜를 확인하세요.").max(31, "날짜를 확인하세요.");

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, "가구 이름을 입력하세요.").max(30),
  goal: z.object({
    template: z.enum(GOAL_TEMPLATE_KEYS as [GoalTemplate, ...GoalTemplate[]]),
    name: z.string().trim().min(1, "목표 이름을 입력하세요.").max(30),
    targetAmount: amountStr,
    targetMonth: z.string().regex(/^\d{4}-\d{2}$/, "목표 시점을 선택하세요."),
  }),
  assets: z
    .array(z.object({ kind: z.enum(["checking", "savings", "investment"]), balance: balanceStr, linked: z.boolean() }))
    .min(1, "모아둔 돈을 한 칸 이상 입력하세요.")
    .refine((a) => new Set(a.map((x) => x.kind)).size === a.length, "자산 항목이 중복되었습니다."),
  loan: z.string().regex(/^\d*$/),
  incomes: z
    .array(z.object({ name: z.string().trim().min(1, "수입 이름을 입력하세요.").max(20), amount: amountStr, day }))
    .min(1, "월수입을 한 줄 이상 입력하세요.")
    .max(4),
  fixed: z
    .array(
      z.object({
        name: z.string().trim().min(1, "고정 지출 이름을 입력하세요.").max(20),
        category: z.enum(FIXED_CATEGORIES),
        amount: amountStr,
        day,
      }),
    )
    .max(15),
  monthStartDay: z.number().int().min(1).max(28),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
