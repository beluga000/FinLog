/**
 * 캡처 글자 인식으로 읽은 가맹점 이름 보정.
 * 한글·영문이 붙은 이름(G마켓, KFC코엑스MALL)은 인식기가 자주 틀리므로
 * 과거에 기록한 가맹점 + 자주 쓰는 가맹점 목록과 '헷갈리기 쉬운 글자'를 감안해 비교한다.
 * 순수 함수 — 클라이언트에서 실행한다.
 */

/** 처음 쓰는 사람도 보정받도록 넣어 두는 자주 쓰는 가맹점 */
export const COMMON_MERCHANTS = [
  "G마켓", "옥션", "11번가", "쿠팡", "쿠팡이츠", "SSG.COM", "컬리", "무신사", "29CM", "오늘의집", "알리익스프레스", "테무",
  "네이버페이", "카카오페이", "토스페이", "배달의민족", "요기요",
  "스타벅스", "투썸플레이스", "이디야커피", "메가MGC커피", "컴포즈커피", "빽다방", "폴바셋", "할리스",
  "맥도날드", "버거킹", "롯데리아", "KFC", "맘스터치", "서브웨이", "파리바게뜨", "뚜레쥬르", "배스킨라빈스",
  "GS25", "CU", "세븐일레븐", "이마트24", "이마트", "홈플러스", "롯데마트", "코스트코", "트레이더스", "다이소", "올리브영",
  "카카오T", "티머니", "코레일", "SRT", "대한항공", "아시아나항공",
  "넷플릭스", "유튜브", "애플", "구글", "멜론", "왓챠", "티빙", "쿠팡와우",
  "CGV", "롯데시네마", "메가박스", "교보문고", "예스24", "알라딘",
];

/** 인식기가 서로 헷갈리는 글자 (대문자 기준) */
const CONFUSABLE: [string, string][] = [
  ["6", "G"], ["0", "O"], ["0", "D"], ["1", "I"], ["1", "L"], ["5", "S"], ["8", "B"], ["2", "Z"], ["4", "A"], ["7", "T"],
];
const CONFUSE = new Set(CONFUSABLE.flatMap(([a, b]) => [a + b, b + a]));

/** 전각 영숫자·기호(Ｌ)만 반각으로 — NFKC 는 한글 자모(ㅁ)까지 바꿔서 쓰지 않는다 */
const halfWidth = (s: string) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const key = (s: string) => halfWidth(s).replace(/[\s·.\-_*()<>]/g, "").toUpperCase();

/** 글자 하나 바꾸는 비용: 같음 0, 헷갈리는 쌍 0.3, 그 외 1 */
function subCost(a: string, b: string): number {
  if (a === b) return 0;
  return CONFUSE.has(a + b) ? 0.3 : 1;
}

/** 0~1 유사도 (헷갈리는 글자를 감안한 편집 거리) */
export function similarity(a: string, b: string): number {
  const x = [...key(a)];
  const y = [...key(b)];
  if (!x.length || !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(x[i - 1], y[j - 1]));
    }
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** 인식 찌꺼기 정리: 낱자 기호, 한글 이름 앞의 깨진 글자 ("1『(강남구청역" → "강남구청역") */
export function cleanMerchant(raw: string): string {
  return halfWidth(raw)
    .replace(/[『』「」“”‘’¥¢§¶©®|]/g, "")
    // 앞에 붙은 기호·점 찌꺼기 (왼쪽 카드 그림 등: "\" 네이버페이", ". ㆍ 탕화…")
    .replace(/^[^\w가-힣]+(?=[\w가-힣])/, "")
    // 기호가 섞인 앞 찌꺼기만 ("1(강남…" 은 지우고 "11월…" 은 둔다)
    .replace(/^\d?[^\w\s가-힣]{1,2}\d?(?=[가-힣])/, "")
    .replace(/\s+[^가-힣A-Za-z\s]{1,2}$/, "")
    // 드라이브스루 'DT점' 이 '07점'·'0T점'·'D7점' 으로 읽힘 (0 으로 시작하는 지점 번호는 없다)
    .replace(/(?<=[가-힣])[0OD][7T](?=점)/g, "DT")
    // 영문·숫자 사이에 끼어든 낱자 자모 ("6ㅎ525" → "6525")
    .replace(/(?<=[A-Za-z0-9])[ㄱ-ㅣ](?=[A-Za-z0-9])/g, "")
    // 한글 사이 '^' 는 'A' ("현대^동점" → "현대A동점")
    .replace(/(?<=[가-힣])\^+(?=[가-힣])/g, "A")
    // 결제대행사 이름 떼기 ("네이버파이낸셜(주) - 안다르" → "안다르")
    .replace(PG_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 간편결제·결제대행사가 '대행사 - 가게' 로 붙이는 앞부분 */
const PG_PREFIX = /^(네이버파이낸셜|카카오페이|토스페이먼츠|비바리퍼블리카|나이스(페이먼츠)?|NICE|KG\s*이니시스|이니시스|KCP|NHN\s*KCP|다날|페이코|NHN\s*페이코)\s*(\(\s*주\s*\)|㈜)?\s*[-–]\s*(?=\S)/i;

export interface MerchantMatch {
  /** 보정한 이름 (확신이 없으면 정리만 한 인식 결과) */
  name: string;
  /** 목록에서 찾았으면 그 이름과 출처 */
  matched: { name: string; source: "history" | "common"; score: number } | null;
}

/**
 * 가장 비슷한 이름으로 보정. 과거 기록을 자주 쓰는 목록보다 먼저 본다.
 * 짧은 이름은 한두 글자만 달라도 전혀 다른 가맹점일 수 있어 더 높은 유사도를 요구한다.
 */
export function matchMerchant(raw: string, history: readonly string[] = [], common: readonly string[] = COMMON_MERCHANTS): MerchantMatch {
  const cleaned = fixBrandPrefix(cleanMerchant(raw), common);
  if (!cleaned) return { name: raw, matched: null };
  let best: MerchantMatch["matched"] = null;
  for (const [list, source] of [
    [history, "history"],
    [common, "common"],
  ] as const) {
    for (const cand of list) {
      const score = Math.max(similarity(raw, cand), similarity(cleaned, cand));
      const len = key(cand).length;
      const need = len <= 3 ? 0.85 : len <= 5 ? 0.75 : len <= 7 ? 0.65 : 0.6;
      if (score >= need && (!best || score > best.score + 0.001)) best = { name: cand, source, score };
    }
    if (best && best.score >= 0.95) break; // 과거 기록에서 거의 같은 이름을 찾았으면 끝
  }
  if (best && key(best.name) === key(cleaned)) return { name: best.name, matched: best.score === 1 ? null : best };
  return { name: best ? best.name : cleaned, matched: best };
}

/**
 * 이름 앞의 영문·숫자 브랜드가 헷갈리는 글자로 읽힌 경우만 고친다 ("6525문정현대A동점" → "GS25문정현대A동점").
 * 바로 뒤가 한글일 때만 (브랜드 + 지점명 모양)
 */
function fixBrandPrefix(name: string, common: readonly string[]): string {
  for (const brand of common) {
    if (!/^[A-Za-z0-9.]+$/.test(brand) || brand.length < 3) continue;
    const head = name.slice(0, brand.length);
    if (head === brand || !/^[가-힣]/.test(name.slice(brand.length))) continue;
    if (similarity(head, brand) >= 0.85) return brand + name.slice(brand.length);
  }
  // 첫 글자가 통째로 빠진 경우 ("525문정현대A동점" ← GS25). 짧은 브랜드는 오보정 위험이 커서 4글자 이상만
  const lead = /^[A-Za-z0-9.]+(?=[가-힣])/.exec(name)?.[0];
  if (lead) {
    for (const brand of common) {
      if (!/^[A-Za-z0-9.]+$/.test(brand) || brand.length < 4 || lead.length !== brand.length - 1) continue;
      if (similarity(lead, brand.slice(1)) >= 0.85) return brand + name.slice(lead.length);
    }
  }
  return name;
}

