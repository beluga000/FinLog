import type { BudgetBucket, TxType } from "@/lib/finance/types";

/** 가구 생성 시 복사되는 기본 카테고리 (PROD.MD §2-4) */
export interface DefaultCategory {
  name: string;
  txType: Extract<TxType, "INCOME" | "EXPENSE">;
  bucket: BudgetBucket | null;
  icon: string;
  children?: { name: string; bucket?: BudgetBucket }[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "급여", txType: "INCOME", bucket: null, icon: "briefcase", children: [{ name: "정기급여" }, { name: "상여" }] },
  { name: "부수입", txType: "INCOME", bucket: null, icon: "sparkles", children: [{ name: "사업·프리랜스" }, { name: "중고판매" }] },
  { name: "금융수입", txType: "INCOME", bucket: null, icon: "landmark", children: [{ name: "이자" }, { name: "배당" }] },
  { name: "기타수입", txType: "INCOME", bucket: null, icon: "gift", children: [{ name: "용돈·선물" }, { name: "환급" }] },

  {
    name: "식비", txType: "EXPENSE", bucket: "NEEDS", icon: "utensils",
    children: [{ name: "장보기" }, { name: "외식", bucket: "WANTS" }, { name: "카페·간식", bucket: "WANTS" }, { name: "배달", bucket: "WANTS" }],
  },
  { name: "주거·관리비", txType: "EXPENSE", bucket: "NEEDS", icon: "home", children: [{ name: "월세" }, { name: "관리비" }, { name: "공과금" }] },
  { name: "통신", txType: "EXPENSE", bucket: "NEEDS", icon: "smartphone", children: [{ name: "휴대폰" }, { name: "인터넷·TV" }, { name: "구독서비스", bucket: "WANTS" }] },
  { name: "교통·차량", txType: "EXPENSE", bucket: "NEEDS", icon: "car", children: [{ name: "대중교통" }, { name: "주유" }, { name: "택시", bucket: "WANTS" }, { name: "차량유지" }] },
  { name: "생활용품", txType: "EXPENSE", bucket: "NEEDS", icon: "shopping-basket" },
  { name: "의료·건강", txType: "EXPENSE", bucket: "NEEDS", icon: "heart-pulse", children: [{ name: "병원·약국" }, { name: "운동", bucket: "WANTS" }] },
  { name: "보험", txType: "EXPENSE", bucket: "NEEDS", icon: "shield" },
  { name: "교육", txType: "EXPENSE", bucket: "NEEDS", icon: "graduation-cap" },
  { name: "문화·여가", txType: "EXPENSE", bucket: "WANTS", icon: "ticket", children: [{ name: "여행" }, { name: "취미" }, { name: "공연·영화" }] },
  { name: "쇼핑·의류", txType: "EXPENSE", bucket: "WANTS", icon: "shirt" },
  { name: "경조사", txType: "EXPENSE", bucket: "NEEDS", icon: "mail" },
  { name: "용돈", txType: "EXPENSE", bucket: "WANTS", icon: "wallet" },
  { name: "육아", txType: "EXPENSE", bucket: "NEEDS", icon: "baby" },
  { name: "반려동물", txType: "EXPENSE", bucket: "NEEDS", icon: "paw-print" },
  { name: "이자·수수료", txType: "EXPENSE", bucket: "NEEDS", icon: "percent", children: [{ name: "대출이자" }, { name: "수수료" }] },
  { name: "기타지출", txType: "EXPENSE", bucket: "WANTS", icon: "ellipsis" },
];
