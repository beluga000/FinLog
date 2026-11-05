import { detectIssuer, monthDayToDate } from "./card-message";
import { cleanMerchant } from "./merchant-match";
import { addDays } from "./period";
import type { DateStr } from "./types";

/**
 * 카드 앱 결제내역 캡처 → 여러 건 지출 후보.
 * 입력은 기기 안 글자 인식(Tesseract.js) 결과 줄(위치 포함) 또는 사용자가 복사해 붙여넣은 글자.
 * 카드사마다 화면이 달라 고정 양식 대신 공통 모양을 찾는다:
 *   날짜 머리글(10.28 (화) / 10월 28일 / 오늘) → 그 아래 줄들의 날짜
 *   금액 줄(4,800원)마다 1건 — 가맹점은 같은 줄 글자, 없으면 바로 위 글자 줄
 *   금액 줄 아래 보조 줄(14:22 · 일시불 · 취소)은 그 건의 정보
 * 클라이언트에서만 실행하고 원문·이미지는 저장하지 않는다.
 */

export interface OcrLine {
  text: string;
  /** 이미지 속 위치 (붙여넣은 글자는 없음 → 줄 순서로 대신) */
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  /** 0~100 */
  confidence?: number;
}

export interface CaptureItem {
  date: DateStr | null;
  merchant: string | null;
  amount: bigint;
  status: "approved" | "canceled";
  /** 일시불 = 1 */
  installment: number | null;
  /** 이 건을 만든 줄들의 최저 인식 신뢰도 (붙여넣기는 null) */
  confidence: number | null;
  /** 이 건을 만든 원래 줄 (확인 화면 표시용) */
  lines: string[];
}

export interface CaptureResult {
  issuer: string | null;
  items: CaptureItem[];
  /** 합계·한도 등 금액이 있지만 건으로 보지 않은 줄 */
  skipped: string[];
  /**
   * 인식기가 놓친 줄이 있어 보이는 세로 구간 (이미지 좌표). 건 없이 보조 줄("일시불 · …")만 나온 자리.
   * 이 구간만 다시 인식해 줄을 보태면 빠진 건을 되살릴 수 있다. 붙여넣은 글자는 항상 빈 배열
   */
  gaps: { x0: number; y0: number; x1: number; y1: number }[];
  /** 날짜·가맹점·금액·할부 중 빠졌거나 인식이 불확실해 등록 후보에서 뺀 건 (사유와 함께) */
  rejected: { item: CaptureItem; reasons: string[]; index: number }[];
}

/** 가맹점·금액 줄 인식 신뢰도가 이보다 낮으면 등록 후보에서 뺀다 (0~100) */
export const MIN_CONFIDENCE = 40;

// 4,800원 · 4.800원(쉼표 오인식) · 4,800 · -4,800원 · 4800원 · 500&('원'을 & # @ ! 로 잘못 읽음)
const AMOUNT = /(-|－|−)?\s*(\d{1,3}(?:\s?[,.]\s?\d{3})+|\d+)\s*(원|윈|[&#@!](?!\d))?/g;
// 2026.10.28 · 22. 1. 27 · 10.28 · 10/28 · 10-28 · 10월 28일 · 21년 8월 22일
const DATE = /(?:(\d{4}|\d{2})\s*[./\-년]\s*)?(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*일?(?!\d)/;
/** 금액을 지운 뒤 남는 '원' 오인식 찌꺼기 ("WORLDTRIPS 2!", "KIWI.COM #") */
const AMOUNT_RESIDUE = /\s+\d{0,2}[&#@!]+\s*$/;
const WEEKDAY = /\(?\s*[월화수목금토일]\s*(?:요일)?\s*\)?/;
const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
const RELATIVE_DAY = /^(오늘|어제)$/;
/** 건 아래 보조 줄 표시 — 날짜 머리글과 구분 ("22. 1. 26 · 일시불", "11.02 19:40") */
/** 화면 제목·정렬 버튼 등 가맹점이 될 수 없는 글자 (맨 위 건의 가맹점이 잘렸을 때 대신 잡히지 않게) */
const SCREEN_TEXT = /^(카드\s*)?이용\s*내역$|^알림$|목록\s*보기|달력\s*보기|최신순|최근순|고액순|내역\s*선택|꼭\s*확인해/;
/** 문자의 머리글·카드 줄·가린 이름 ("[Web발신]", "IBK기업BC(2017)체크승인", "김*우님") */
const NOT_MERCHANT = /발신\]?$|^\[?\s*web|(승인|취소|매출접수)\s*$|^[가-힣]{1,2}\s*[*＊]\s*[가-힣]{0,2}\s*님?$|[가-힣]님$/i;
/** 승인 문자 줄 ("홍길동 님, 현대 네이버 승인 일시불, 11/4 11:30") — 가맹점이 아니다 */
const APPROVAL_MSG = /님\s*,|님\s|승인\s*일시불|승인\s*\d+\s*개월/;
const SUB_LINE = /\d{1,2}:\d{2}|일시불|개월|승인|취소|기준|[|·•]/;
/** 금액이 있어도 결제 건이 아닌 줄 */
const SUMMARY = /합계|총\s*(이용|결제|금액)|이용\s*금액|결제\s*(예정|금액\s*합)|청구|한도|잔액|누적|포인트|적립|캐시백|이번\s*달|월\s*이용|총\s*\d+\s*건|초과|계획|원\s*(을|를|이|가|은|는|에)(\s|$)/; // 마지막: "100,000원을 초과했어요" 같은 안내 문장
const CANCEL = /취소|환불/;
const INSTALLMENT = /일시불|(\d{1,2})\s*개월/;
/** 보조 정보 낱말 — 지우고 남는 글자가 없으면 가맹점이 아니다 */
const META_WORDS = /일시불|\d{1,2}\s*개월|할부|[가-힣]{0,2}승인|취소|환불|결제|완료|해외|국내|본인|가족|체크|신용|카드|\(\s*\d{2,4}\s*\)|\d{4}|[|·•,:/\-()[\]]/g;

interface Row {
  text: string;
  y0: number;
  y1: number;
  confidence: number | null;
}

export function parseCardCapture(input: OcrLine[] | string, today: DateStr): CaptureResult {
  const rows = toRows(input);
  // 카드사는 '카드'·'뱅크'가 들어간 줄에서만 찾는다 (가맹점 "카카오T"를 카카오뱅크로 오인하지 않게)
  const issuerText = rows
    .map((r) => r.text)
    .filter((t) => /카드|뱅크|card|승인/i.test(t)) // "현대 네이버 승인 일시불"
    .join("\n");
  const result: CaptureResult = { issuer: detectIssuer(issuerText), items: [], skipped: [], gaps: [], rejected: [] };
  const fromImage = typeof input !== "string";
  const isCheckCard = rows.some((r) => /체크/.test(r.text));
  // 다시 인식할 때 가로는 글자가 있는 범위만 (화면 가장자리를 넣으면 인식이 깨진다)
  const boxes = fromImage ? input.flatMap((l) => (l.bbox && l.text.trim() ? [l.bbox] : [])) : [];
  const textX0 = boxes.length ? Math.max(0, Math.min(...boxes.map((b) => b.x0)) - 8) : 0;
  const textX1 = boxes.length ? Math.max(...boxes.map((b) => b.x1)) + 8 : 0;

  let currentDate: DateStr | null = null;
  /** 가맹점 줄 다음에 온 날짜 보조 줄 — 아래 금액 줄의 날짜 (할인 줄 때문에 금액이 한 줄 밀린 화면) */
  let pendingDate: DateStr | null = null;
  /** 그 날짜 보조 줄 글자 (할부 등 정보도 아래 건에 넘긴다) */
  let pendingDetail: string | null = null;
  let open: OpenItem | null = null;
  /** 아직 어느 건의 가맹점도 아닌 글자 줄 (가맹점이 금액 위 줄에 있는 화면용) */
  let orphan: Orphan | null = null;

  /** 바로 앞 줄이 승인 문자 줄이었나 (알림 화면에서 그 다음 줄은 누적 금액) */
  let afterApproval = false;
  /** 바로 다음 금액 건이 '매출접수' 문자 (머리글이 금액보다 위에 온다) */
  let transitNext = false;
  let lastY1 = 0;

  for (const row of rows) {
    const text = normalize(row.text);
    if (!text) continue;
    const aboveY1 = lastY1;
    lastY1 = row.y1;
    const prevApproval = afterApproval;
    afterApproval = false;

    const relative = text.match(RELATIVE_DAY);
    if (relative) {
      currentDate = relative[1] === "오늘" ? today : addDays(today, -1);
      open = null;
      orphan = null;
      continue;
    }

    const amount = findAmount(text);
    const date = findDate(text, today);

    if (amount !== null && SUMMARY.test(text)) {
      result.skipped.push(row.text);
      open = null;
      orphan = null;
      continue;
    }

    if (amount === null) {
      // 날짜만 있는 줄: 시각·일시불·구분점이 붙어 있으면 바로 위 건의 보조 줄, 날짜(요일)뿐이면 머리글
      if (date && isOnlyDate(text)) {
        if (SUB_LINE.test(text) && open && !open.dateFromRow) {
          applyDetails(open, text, today);
          open.date = date;
          open.dateFromRow = true;
          open.lines.push(row.text);
        } else if (SUB_LINE.test(text) && orphan) {
          // 가맹점 줄 → 날짜 보조 줄 → (할인·금액 줄) : 가맹점은 그대로 두고 날짜만 아래 건에 넘긴다
          pendingDate = date;
          const waiting: Orphan = orphan;
          if (waiting.owner) waiting.owner.lines = waiting.owner.lines.filter((l) => merchantFrom(normalize(l)) !== waiting.text);
          orphan = { ...waiting, owner: null };
          pendingDetail = text;
          open = null;
        } else {
          currentDate = date;
          open = null;
          orphan = null;
        }
        continue;
      }
      // 건 없이 나온 보조 줄 = 바로 위 가맹점·금액 줄을 인식기가 놓침
      if (fromImage && !open && !orphan && /일시불|\d+\s*개월|승인/.test(text) && row.y0 > aboveY1) {
        result.gaps.push({ x0: textX0, y0: aboveY1, x1: textX1, y1: row.y0 });
      }
      // 보조 줄 정보는 열린 건에 붙인다
      if (open) applyDetails(open, text, today);
      if (APPROVAL_MSG.test(text)) {
        afterApproval = true;
      } else {
        if (/매출\s*접수/.test(text)) transitNext = true;
        const name = merchantFrom(text);
        // 문자의 구조 줄(카드·승인 줄, 가린 이름)이 나오면 그 위 줄은 가맹점 후보가 아니다 ("[Web발신]"이 깨져 읽힌 찌꺼기 등)
        if (!name && NOT_MERCHANT.test(text.trim())) orphan = null;
        if (name) {
          orphan = { text: name, owner: open, y0: row.y0, y1: row.y1, confidence: row.confidence };
          // 문자 모양(금액 → 날짜 → 가맹점): 가맹점 없는 열린 건이면 일단 그 건의 가맹점으로.
          // 다음 금액 줄에 더 가까우면 그쪽이 가져간다 (아래 금액 줄 처리)
          if (open && !open.merchant) {
            open.merchant = name;
            open.merchantBelow = true;
            open.confidence = minConfidence(open.confidence, row.confidence);
          }
        }
      }
      if (open) {
        open.lines.push(row.text);
      }
      continue;
    }

    // 금액 줄 = 새 건
    const rowDate = date ?? pendingDate;
    const rowDetail = pendingDetail;
    pendingDate = null;
    pendingDetail = null;
    const negative = amount < 0n;
    const item: OpenItem = {
      date: rowDate ?? currentDate,
      dateFromRow: !!rowDate,
      merchant: merchantFrom(stripAmount(text)),
      amount: negative ? -amount : amount,
      status: negative || CANCEL.test(text) ? "canceled" : "approved",
      installment: null,
      confidence: row.confidence,
      lines: [row.text],
      amountY1: row.y1,
      transitNotice: transitNext,
    };
    transitNext = false;
    // 승인 문자 바로 아래 가맹점 없는 금액 = '누적'이 깨져 읽힌 누적 금액 ("+%1,292,084%")
    if (!item.merchant && prevApproval) {
      result.skipped.push(row.text);
      orphan = null;
      continue;
    }
    applyDetails(item, text, today);
    if (rowDetail) applyDetails(item, rowDetail, today);
    // "11월 이용금액" 다음 줄에 금액만 있는 요약 영역
    if (!item.merchant && orphan && SUMMARY.test(orphan.text)) {
      result.skipped.push(`${orphan.text} ${row.text}`);
      open = null;
      orphan = null;
      continue;
    }
    // 위 줄 가맹점은 바로 위(줄 높이 4배 안)에 있을 때만 — 맨 위 건의 가맹점이 잘려 화면 제목·상태 표시줄이 잡히지 않게
    if (orphan && row.y0 - orphan.y1 > (row.y1 - row.y0) * 4) orphan = null;
    if (!item.merchant && orphan) {
      const owner = orphan.owner as OpenItem | null;
      if (owner?.merchantBelow && owner.merchant === orphan.text) {
        // 앞 건 아래에도, 이 금액 줄 위에도 있는 가맹점 줄 → 더 가까운 쪽 건의 것
        const toThis = row.y0 - orphan.y1;
        const toOwner = orphan.y0 - (owner.amountY1 ?? orphan.y0);
        if (toThis >= toOwner) orphan = null;
        else {
          owner.merchant = null;
          owner.merchantBelow = false;
        }
      }
    }
    if (!item.merchant && orphan) {
      item.merchant = orphan.text;
      item.confidence = minConfidence(item.confidence, orphan.confidence);
      // 앞 건의 보조 줄로 붙었던 줄이면 앞 건에서 떼어낸다
      if (orphan.owner) orphan.owner.lines = orphan.owner.lines.filter((l) => merchantFrom(normalize(l)) !== orphan!.text);
      item.lines.unshift(orphan.text);
    }
    orphan = null;
    if (item.amount > 0n) {
      result.items.push(item);
      open = item;
    }
  }

  const transitFlags = result.items.map((item) => !!(item as OpenItem).transitNotice);
  const all = result.items.map((item) => {
    const { dateFromRow, merchantBelow, amountY1, transitNotice, ...rest } = item as OpenItem;
    void transitNotice;
    void dateFromRow;
    void merchantBelow;
    void amountY1;
    // 체크카드는 할부가 없다 — 할부 표시가 없으면 일시불 ("체크승인", "국내체크일시불")
    if (rest.installment === null && isCheckCard) rest.installment = 1;
    return rest;
  });
  // 하나라도 빠졌거나 불확실한 건은 등록 후보에서 뺀다 (상태는 승인·취소 중 하나로 항상 정해진다)
  result.items = [];
  for (const [index, item] of all.entries()) {
    const reasons = incompleteReasons(item, transitFlags[index]);
    if (reasons.length) result.rejected.push({ item, reasons, index });
    else result.items.push(item);
  }
  return result;
}

/**
 * 후불 교통 합계 ("교통-지하철21건", 문자 "매출접수") — 교통비는 다른 방식으로 기록하므로 등록하지 않는다.
 * 개별 결제가 아니라 기간 합계라 다른 기록과 겹친다
 */
const TRANSIT_TOTAL = /교통\s*[-–]?\s*(지하철|버스|택시)?\s*\d+\s*건|후불\s*교통/;

function incompleteReasons(item: CaptureItem, transitNotice: boolean): string[] {
  if (transitNotice || TRANSIT_TOTAL.test(item.merchant ?? "")) return ["교통 합계 — 따로 기록"];
  const reasons: string[] = [];
  if (!item.date) reasons.push("날짜 없음");
  if (!item.merchant) reasons.push("가맹점 없음");
  if (item.installment === null) reasons.push("할부 정보 없음");
  if (item.confidence !== null && item.confidence < MIN_CONFIDENCE) reasons.push(`인식 불확실(${Math.round(item.confidence)})`);
  return reasons;
}

/** 아직 어느 건의 가맹점도 아닌 글자 줄 */
type Orphan = { text: string; owner: CaptureItem | null; y0: number; y1: number; confidence: number | null };

type OpenItem = CaptureItem & {
  dateFromRow?: boolean;
  /** 가맹점을 금액 아래 줄에서 가져왔나 (문자 모양) */
  merchantBelow?: boolean;
  /** 금액 줄 아래끝 (가맹점 줄이 어느 건에 더 가까운지 견줄 때) */
  amountY1?: number;
  /** 문자 머리글이 '매출접수' (후불 교통 합계 청구) */
  transitNotice?: boolean;
};

function toRows(input: OcrLine[] | string): Row[] {
  const lines: OcrLine[] =
    typeof input === "string"
      ? input
          .replace(/\r/g, "")
          .split("\n")
          .map((text, i) => ({ text, bbox: { x0: 0, x1: 1000, y0: i * 20, y1: i * 20 + 16 } }))
      : input;
  const placed = lines
    .filter((l) => l.text.trim())
    .map((l, i) => ({
      text: l.text.trim(),
      x0: l.bbox?.x0 ?? 0,
      y0: l.bbox?.y0 ?? i * 20,
      y1: l.bbox?.y1 ?? i * 20 + 16,
      confidence: l.confidence ?? null,
    }))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // 금액은 오른쪽 정렬이라 '원'이 통째로 빠져도("KFC 500") 오른쪽 끝에 붙은 숫자면 금액으로 본다.
  // 이미지 위치가 있을 때만 (붙여넣은 글자는 위치가 없다)
  if (typeof input !== "string") {
    const boxed = input.filter((l) => l.bbox && l.text.trim());
    if (boxed.length) {
      const minX = Math.min(...boxed.map((l) => l.bbox!.x0));
      const maxX = Math.max(...boxed.map((l) => l.bbox!.x1));
      const tolerance = (maxX - minX) * 0.03;
      const byText = new Map(boxed.map((l) => [l.text.trim(), l.bbox!]));
      for (const p of placed) {
        const box = byText.get(p.text);
        if (box && maxX - box.x1 <= tolerance && !/원|윈/.test(p.text)) {
          // 1,000원 이상은 쉼표가 붙으므로 쉼표 없는 금액은 3자리(100~999원). 4자리면 끝 숫자가 '원' 오인식 ("500원" → "5002").
          // 두 자리는 상태 표시줄 배터리·신호 숫자일 수 있어 보지 않는다
          p.text = p.text.replace(/(^|\s)(-?\d{3})\d?\s*[&#@!ㅁ]?$/, "$1$2원");
        }
      }
    }
  }

  // 세로로 절반 넘게 겹치는 줄은 한 줄 (왼쪽 가맹점 · 오른쪽 금액이 따로 인식된 경우)
  const rows: (Row & { parts: { x0: number; text: string }[] })[] = [];
  for (const l of placed) {
    const last = rows[rows.length - 1];
    if (last) {
      const overlap = Math.min(last.y1, l.y1) - Math.max(last.y0, l.y0);
      const minH = Math.min(last.y1 - last.y0, l.y1 - l.y0);
      if (minH > 0 && overlap >= minH * 0.5) {
        last.parts.push({ x0: l.x0, text: l.text });
        last.y0 = Math.min(last.y0, l.y0);
        last.y1 = Math.max(last.y1, l.y1);
        last.confidence = minConfidence(last.confidence, l.confidence);
        continue;
      }
    }
    rows.push({ text: "", y0: l.y0, y1: l.y1, confidence: l.confidence, parts: [{ x0: l.x0, text: l.text }] });
  }
  return rows.map(({ parts, ...r }) => ({
    ...r,
    text: parts
      .sort((a, b) => a.x0 - b.x0)
      .map((p) => p.text)
      .join(" "),
  }));
}

function normalize(text: string): string {
  return text
    .replace(/[￦₩]/g, "")
    // 할인 금액은 결제 금액이 아니다 ("할인 800원   22,450원")
    .replace(/(청구|즉시)?할인\s*-?[\d,]+\s*원/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 줄의 결제 금액 (음수 = 취소 표시). 날짜·시각 숫자는 금액이 아니다 */
function findAmount(text: string): bigint | null {
  const cleaned = text.replace(DATE, " ").replace(TIME, " ").replace(/\d{1,2}\s*개월/, " ").replace(/\(\s*\d{2,4}\s*\)/g, " ");
  for (const m of cleaned.matchAll(AMOUNT)) {
    const [, minus, digits, won] = m;
    const grouped = /[,.]/.test(digits);
    // '원'이 붙었거나 천 단위 구분이 있어야 금액으로 본다 (카드 끝자리·건수 숫자 제외)
    if (!won && !grouped) continue;
    // '원' 대신 기호(& @ …)가 붙은 쉼표 없는 숫자는 100~999 만 ("500&"). 두 자리는 상태 표시줄 배터리 ("56 @")
    if (!grouped && won && !/원|윈/.test(won) && digits.length !== 3) continue;
    const value = BigInt(digits.replace(/[\s,.]/g, ""));
    if (value === 0n) continue;
    return minus ? -value : value;
  }
  return null;
}

function stripAmount(text: string): string {
  return text
    .replace(AMOUNT, (m, _minus, digits: string, won) => (won || /[,.]/.test(digits) ? " " : m))
    .replace(AMOUNT_RESIDUE, "");
}

function findDate(text: string, today: DateStr): DateStr | null {
  const m = text.match(DATE);
  if (!m) {
    // 점이 빠진 YYMMDD ("26.11.02 | 12:44" → "261102 | 12:44")
    const packed = text.match(/(?<!\d)(\d{2})(\d{2})(\d{2})(?=\s*[|ㅣ]?\s*\d{1,2}:\d{2})/);
    if (packed) {
      const [, , mm, dd] = packed.map(Number);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `20${packed[1]}-${packed[2]}-${packed[3]}`;
    }
    // 시각 앞 "11/1" 의 '/' 가 '7' 로 읽힘 ("11/1 16:56" → "1171 16:56")
    const slash = text.match(/(?<!\d)(1[0-2]|[1-9])7([1-3]?\d)\s+\d{1,2}:\d{2}/);
    return slash ? monthDayToDate(Number(slash[1]), Number(slash[2]), today) : null;
  }
  const [, year, month, day] = m;
  if (year) {
    const mm = Number(month);
    const dd = Number(day);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const yyyy = year.length === 2 ? `20${year}` : year;
    const ymd = (mo: number) => `${yyyy}-${String(mo).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    // 일은 0 을 채웠는데 월이 한 자리 → 월 숫자 하나가 빠졌다 ("26.11.03" → "26.1.03"). 오늘 이전 가장 가까운 달로
    if (month.length === 1 && /^0\d$/.test(day) && mm === 1) {
      const candidates = [12, 11, 10, 1].map(ymd).filter((d) => d <= today);
      if (candidates.length) return candidates[0];
    }
    return ymd(mm);
  }
  return monthDayToDate(Number(month), Number(day), today);
}

function isOnlyDate(text: string): boolean {
  const rest = text
    .replace(DATE, "")
    .replace(TIME, "")
    .replace(/\(\s*\S{1,2}\s*\)?/, "") // 괄호 요일 — 깨져 읽혀도 ("(화)" → "(3h")
    // 보조 낱말을 요일보다 먼저 지운다 (요일 '일'이 "국내일시불"의 '일'을 먼저 먹지 않게)
    .replace(META_WORDS, "")
    .replace(WEEKDAY, "")
    .trim();
  return rest.length <= 1;
}

/** 가맹점 이름으로 쓸 만한 글자 (한글·영문 2자 이상 남아야 함) */
function merchantFrom(text: string): string | null {
  const withoutDate = text.replace(DATE, " ").replace(TIME, " ");
  const core = withoutDate.replace(META_WORDS, " ").replace(/\s+/g, " ").trim();
  if ((core.match(/[가-힣A-Za-z]/g) ?? []).length < 2) return null;
  // 화면 제목은 앞뒤 기호 찌꺼기를 걷고 본다 ("< _ 카드이용내역 =")
  if (NOT_MERCHANT.test(withoutDate.trim())) return null;
  if (SCREEN_TEXT.test(withoutDate.replace(/[^가-힣A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim())) return null;
  if (detectIssuer(core) && /카드/.test(withoutDate)) return null; // "신한카드 본인 1234"
  // 앞뒤 보조 낱말만 걷어낸 원래 모양을 쓴다 (가맹점 이름 속 '·'·괄호 보존)
  const name = withoutDate
    .replace(/^[\s|·•\-]+|[\s|·•\-]+$/g, "")
    .replace(/\s*[|·•]\s*(일시불|\d{1,2}\s*개월|승인|취소|결제완료).*$/, "")
    .replace(/\s+(일시불|\d{1,2}\s*개월|승인|취소)$/, "")
    .trim();
  // 인식 찌꺼기 정리 ("WORLDTRIPS 8", "… ¥", "1『(강남구청역")
  return cleanMerchant(name).slice(0, 100) || null;
}

function applyDetails(item: CaptureItem, text: string, today: DateStr) {
  if (CANCEL.test(text)) item.status = "canceled";
  const inst = text.match(INSTALLMENT);
  if (inst) item.installment = inst[1] ? Number(inst[1]) : 1;
  const open = item as OpenItem;
  if (!open.dateFromRow) {
    const d = findDate(text, today);
    if (d) {
      item.date = d;
      open.dateFromRow = true;
    }
  }
}

function minConfidence(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/**
 * 한글 줄을 영문으로 잘못 읽은 듯한 줄 ("탕화쿵푸마라탕" → "ElelEEnRetE").
 * 이 줄은 한국어로만 다시 인식해 보는 편이 낫다 (한국어+영어 인식기가 영문으로 기운다)
 */
export function looksLikeMisreadKorean(line: OcrLine): boolean {
  const t = line.text.trim();
  if (/[가-힣]/.test(t) || !line.bbox) return false;
  if ((t.match(/[A-Za-z]/g) ?? []).length < 3) return false;
  return (line.confidence ?? 100) < 50;
}

