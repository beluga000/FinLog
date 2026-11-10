import { isGenericMerchant, merchantKey } from "./merchant-match";

/**
 * 가맹점 → 카테고리 (PRD 2-5 자동 분류).
 * 1) 가구가 정한 규칙 ("앞으로 탕화콩푸마라탕은 식비로") — 지점 이름이 붙어도 맞춘다 (GS25 → GS25문정현대A동점)
 * 2) 브랜드 사전 — 처음 쓰는 가맹점도 편의점·배달·카페 정도는 알아서 고른다
 * 네이버페이·쿠팡처럼 이름만으로 무엇을 샀는지 모르는 가맹점은 규칙도 사전도 쓰지 않는다.
 * 순수 함수 — 기록 창(클라이언트)과 캡처 점검(서버)이 같이 쓴다.
 */

export { merchantKey };

export interface MerchantRule {
  merchantKey: string;
  merchant: string;
  categoryId: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  txType: string;
  parentId?: string | null;
}

export type CategoryHit = { categoryId: string; source: "rule" | "brand"; rule?: MerchantRule };

/** 규칙 앞부분 일치는 이 길이 이상만 — "CU" 같은 두 글자 규칙이 아무 영문 이름에나 붙지 않게 지점 이름은 한글로 이어져야 한다 */
const PREFIX_MIN = 2;

/** 규칙을 저장할 수 있는 가맹점인지 (이름만으로 품목을 알 수 없는 곳은 제외) */
export function canHaveRule(merchant: string | null | undefined): merchant is string {
  const name = merchant?.trim();
  return !!name && merchantKey(name).length >= PREFIX_MIN && !isGenericMerchant(name);
}

/** 정확히 같은 키 → 아니면 가장 긴 앞부분 일치 (뒤가 지점 이름이어야 함) */
export function findRule(merchant: string, rules: readonly MerchantRule[]): MerchantRule | null {
  const k = merchantKey(merchant);
  if (!k) return null;
  let best: MerchantRule | null = null;
  for (const r of rules) {
    if (r.merchantKey === k) return r;
    if (r.merchantKey.length < PREFIX_MIN || !k.startsWith(r.merchantKey)) continue;
    // "CU" 규칙이 "CUCKOO" 에 붙지 않게 — 브랜드 뒤는 한글(지점명)이나 숫자여야 한다
    if (!/^[가-힣0-9]/.test(k.slice(r.merchantKey.length))) continue;
    if (!best || r.merchantKey.length > best.merchantKey.length) best = r;
  }
  return best;
}

/** 브랜드 → 카테고리 이름 후보 (앞에서부터 가구에 있는 이름을 쓴다 — 사용자가 "편의점"을 만들었으면 그쪽) */
const BRANDS: { brands: string[]; categories: string[] }[] = [
  { brands: ["GS25", "CU", "세븐일레븐", "이마트24", "미니스톱"], categories: ["편의점", "카페·간식", "간식"] },
  { brands: ["배달의민족", "배민", "쿠팡이츠", "요기요", "땡겨요"], categories: ["배달", "외식"] },
  {
    brands: ["스타벅스", "투썸플레이스", "이디야", "메가MGC", "메가커피", "컴포즈", "빽다방", "폴바셋", "할리스", "파리바게뜨", "뚜레쥬르", "배스킨라빈스", "던킨"],
    categories: ["카페·간식", "카페", "간식"],
  },
  { brands: ["맥도날드", "버거킹", "롯데리아", "KFC", "맘스터치", "서브웨이"], categories: ["외식"] },
  { brands: ["이마트", "홈플러스", "롯데마트", "코스트코", "트레이더스", "노브랜드", "하나로마트", "컬리", "마켓컬리"], categories: ["장보기", "마트"] },
  { brands: ["다이소", "올리브영"], categories: ["생활용품"] },
  { brands: ["카카오T", "카카오택시", "우티", "타다"], categories: ["택시", "교통·차량"] },
  { brands: ["티머니", "코레일", "SRT", "캐시비"], categories: ["대중교통", "교통·차량"] },
  { brands: ["SK에너지", "GS칼텍스", "S-OIL", "에쓰오일", "현대오일뱅크", "알뜰주유소"], categories: ["주유", "교통·차량"] },
  { brands: ["넷플릭스", "NETFLIX", "유튜브", "YOUTUBE", "멜론", "왓챠", "티빙", "웨이브", "디즈니플러스", "스포티파이", "쿠팡와우"], categories: ["구독서비스", "구독"] },
  { brands: ["CGV", "롯데시네마", "메가박스"], categories: ["공연·영화", "문화·여가"] },
  { brands: ["무신사", "29CM", "지그재그", "에이블리"], categories: ["쇼핑·의류"] },
];
/** 이름 안에 들어 있으면 그 종류 (지점명·상호가 제각각인 업종) */
const KEYWORDS: { words: string[]; categories: string[] }[] = [
  { words: ["약국", "의원", "병원", "치과", "한의원"], categories: ["병원·약국", "의료·건강"] },
  { words: ["주유소"], categories: ["주유", "교통·차량"] },
  { words: ["관리비"], categories: ["관리비"] },
];

const BRAND_INDEX = BRANDS.flatMap(({ brands, categories }) => brands.map((b) => ({ key: merchantKey(b), categories }))).sort(
  (a, b) => b.key.length - a.key.length, // 이마트24 를 이마트보다 먼저
);

function categoryByNames(names: string[], categories: readonly CategoryRef[]): string | null {
  for (const name of names) {
    const hit = categories.find((c) => c.txType === "EXPENSE" && c.name === name);
    if (hit) return hit.id;
  }
  return null;
}

/** 브랜드 사전으로 고른 지출 카테고리 (없으면 null) */
export function guessByBrand(merchant: string, categories: readonly CategoryRef[]): string | null {
  if (isGenericMerchant(merchant)) return null;
  const k = merchantKey(merchant);
  if (!k) return null;
  for (const b of BRAND_INDEX) {
    if (k === b.key || (k.startsWith(b.key) && /^[가-힣0-9]/.test(k.slice(b.key.length)))) return categoryByNames(b.categories, categories);
  }
  for (const w of KEYWORDS) {
    if (w.words.some((word) => k.includes(word))) return categoryByNames(w.categories, categories);
  }
  return null;
}

/** 규칙 → 브랜드 사전 순. 지금 있는 지출 카테고리만 돌려준다 */
export function resolveCategory(merchant: string | null | undefined, rules: readonly MerchantRule[], categories: readonly CategoryRef[]): CategoryHit | null {
  const name = merchant?.trim();
  if (!name || isGenericMerchant(name)) return null;
  const rule = findRule(name, rules);
  if (rule && categories.some((c) => c.id === rule.categoryId && c.txType === "EXPENSE")) return { categoryId: rule.categoryId, source: "rule", rule };
  const brand = guessByBrand(name, categories);
  return brand ? { categoryId: brand, source: "brand" } : null;
}

/** 같은 날 같은 가맹점에서 금액이 거의 같은 결제 — 캡처가 한 결제를 두 번 읽었거나 같은 결제가 두 번 기록된 경우 */
export const NEAR_AMOUNT_RATIO = 0.03;
export function isNearAmount(a: bigint, b: bigint): boolean {
  if (a === b) return true;
  const hi = a > b ? a : b;
  const lo = a > b ? b : a;
  return lo > 0n && Number(hi - lo) <= Number(hi) * NEAR_AMOUNT_RATIO;
}

export interface DupCandidate {
  id: string;
  type: string;
  date: string;
  merchant: string | null;
  amount: bigint;
  /** "다른 결제예요"로 의심을 끈 기록 */
  notDuplicate: boolean;
}

/**
 * 가계부 목록의 같은 결제 의심 묶음 — 같은 날·같은 가맹점 지출 중 금액이 거의 같은 것끼리.
 * 묶음 전체가 "다른 결제예요"면 빼고, 나중에 비슷한 기록이 또 생기면 그 기록과 함께 다시 의심한다.
 * 반환: 기록 id → 같은 묶음의 id 전부(자기 포함, 목록 순서).
 */
export function findSuspectedDuplicates(rows: readonly DupCandidate[]): Map<string, string[]> {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  const byDay = new Map<string, DupCandidate[]>();
  for (const t of rows) {
    const name = t.merchant?.trim();
    if (t.type !== "EXPENSE" || !name) continue;
    parent.set(t.id, t.id);
    const day = `${t.date}\u0000${merchantKey(name)}`;
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  for (const same of byDay.values()) {
    for (let i = 0; i < same.length; i++) {
      for (let j = i + 1; j < same.length; j++) {
        if (isNearAmount(same[i].amount, same[j].amount)) parent.set(root(same[j].id), root(same[i].id));
      }
    }
  }
  const groups = new Map<string, DupCandidate[]>();
  for (const t of rows) {
    if (!parent.has(t.id)) continue;
    const r = root(t.id);
    groups.set(r, [...(groups.get(r) ?? []), t]);
  }
  const out = new Map<string, string[]>();
  for (const g of groups.values()) {
    if (g.length < 2 || g.every((t) => t.notDuplicate)) continue;
    const ids = g.map((t) => t.id);
    for (const id of ids) out.set(id, ids);
  }
  return out;
}
