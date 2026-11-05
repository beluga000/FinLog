import { describe, expect, it } from "vitest";
import { looksLikeMisreadKorean, parseCardCapture, type OcrLine } from "../card-capture";

const TODAY = "2026-11-04";

/** 위치 있는 줄: [y, x, text] */
function lines(rows: [number, number, string][]): OcrLine[] {
  return rows.map(([y, x, text]) => ({ text, bbox: { x0: x, x1: x + 200, y0: y, y1: y + 30 }, confidence: 90 }));
}

/** 해석한 모든 건 (등록 후보 + 빠진 건) — 원래 순서대로 */
const allItems = (r: ReturnType<typeof parseCardCapture>) => {
  const out = [...r.items];
  for (const x of r.rejected) out.splice(x.index, 0, x.item);
  return out;
};

const brief = (r: ReturnType<typeof parseCardCapture>) =>
  allItems(r).map((i) => ({ date: i.date, merchant: i.merchant, amount: Number(i.amount), status: i.status, installment: i.installment }));

describe("카드 결제내역 캡처 해석", () => {
  it("날짜 머리글 + 가맹점·금액 한 줄 + 보조 줄", () => {
    const r = parseCardCapture(
      lines([
        [100, 40, "이번 달 이용금액 1,234,000원"],
        [200, 40, "10.28 (화)"],
        [260, 40, "스타벅스 강남점"],
        [260, 700, "4,800원"],
        [300, 40, "14:22 | 일시불 | 승인"],
        [380, 40, "쿠팡"],
        [380, 700, "129,000원"],
        [420, 40, "09:10 | 3개월"],
        [500, 40, "10.27 (월)"],
        [560, 40, "GS25 역삼점"],
        [560, 700, "-2,500원"],
        [600, 40, "18:01 | 취소"],
      ]),
      TODAY,
    );
    expect(brief(r)).toEqual([
      { date: "2026-10-28", merchant: "스타벅스 강남점", amount: 4800, status: "approved", installment: 1 },
      { date: "2026-10-28", merchant: "쿠팡", amount: 129000, status: "approved", installment: 3 },
      { date: "2026-10-27", merchant: "GS25 역삼점", amount: 2500, status: "canceled", installment: null },
    ]);
    expect(r.skipped).toEqual(["이번 달 이용금액 1,234,000원"]);
  });

  it("가맹점이 금액 위 줄에 있는 화면", () => {
    const r = parseCardCapture(
      lines([
        [100, 40, "10월 30일 목요일"],
        [160, 40, "이디야커피"],
        [200, 40, "3,500원"],
        [240, 40, "12:00 신한카드(1234)"],
        [300, 40, "올리브영"],
        [340, 40, "21,900원"],
      ]),
      TODAY,
    );
    expect(brief(r)).toEqual([
      { date: "2026-10-30", merchant: "이디야커피", amount: 3500, status: "approved", installment: null },
      { date: "2026-10-30", merchant: "올리브영", amount: 21900, status: "approved", installment: null },
    ]);
  });

  it("각 건 아래 날짜·시각 줄이 붙는 화면 (머리글 없음)", () => {
    const r = parseCardCapture(
      lines([
        [100, 40, "배달의민족"],
        [100, 700, "23,000원"],
        [140, 40, "11.02 19:40"],
        [200, 40, "카카오T"],
        [200, 700, "8,700원"],
        [240, 40, "11.01 23:15"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([
      ["2026-11-02", "배달의민족", 23000],
      ["2026-11-01", "카카오T", 8700],
    ]);
  });

  it("오늘·어제 머리글, 1월에 보는 12월 내역은 작년", () => {
    const r = parseCardCapture("오늘\n편의점 1,200원\n12.30 (화)\n마트 45,000원", "2027-01-02");
    expect(brief(r).map((i) => [i.date, i.amount])).toEqual([
      ["2027-01-02", 1200],
      ["2026-12-30", 45000],
    ]);
  });

  it("붙여넣은 글자 (위치 없음) 와 쉼표 오인식", () => {
    const r = parseCardCapture("[신한카드]\n10.29 (수)\n김밥천국 7.000원\n일시불", TODAY);
    expect(r.issuer).toBe("신한카드");
    expect(brief(r)).toEqual([{ date: "2026-10-29", merchant: "김밥천국", amount: 7000, status: "approved", installment: 1 }]);
  });

  it("카드 끝자리·건수 숫자는 금액이 아니다", () => {
    const r = parseCardCapture("신한카드 1234\n총 12건\n10.28\n교보문고 15,000원", TODAY);
    expect(brief(r).map((i) => [i.merchant, i.amount])).toEqual([["교보문고", 15000]]);
  });

  it("실제 캡처 인식 결과: YY. M. D 날짜, '원'을 & # ! 로 잘못 읽음, 원 누락", () => {
    const r = parseCardCapture(
      lines([
        [10, 40, "12:56 97%"],
        [100, 200, "21년 8월 22일 ~ 22년 2월 22일"],
        [250, 40, "KFCRAAMALL 3,800"],
        [300, 40, "22.1.27 · 일시불 · 적립·할인예정 3(0.19%)"],
        [440, 40, "KFCZAAMALL 500&"],
        [490, 40, "22.1.27 · 일시불"],
        [630, 40, "WORLDTRIPS 34,4882!"],
        [680, 40, "22.1.26 · LAE · 적립·할인예정68(0.29%)"],
        [820, 40, "전자수입인지 8,500원"],
        [870, 40, "22. 1. 26 · 일시불"],
        [1010, 40, "KIWI.COM 365,017#"],
        [1060, 40, "22. 1. 25 · 일시불 · 적립·할인예정"],
        [1110, 40, "728(0.2%)"],
        [1680, 40, "AIRBNB * HMRJSEBD9S 410,006&"],
        [1730, 40, "22.1.25 · 일시불 · 적립·할인예정"],
        [1780, 40, "818(0.2%)"],
        [1930, 40, "111 O <"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount, i.installment])).toEqual([
      ["2022-01-27", "KFCRAAMALL", 3800, 1],
      ["2022-01-27", "KFCZAAMALL", 500, 1],
      ["2022-01-26", "WORLDTRIPS", 34488, null],
      ["2022-01-26", "전자수입인지", 8500, 1],
      ["2022-01-25", "KIWI.COM", 365017, 1],
      ["2022-01-25", "AIRBNB * HMRJSEBD9S", 410006, 1],
    ]);
  });

  it("'원'이 통째로 빠진 쉼표 없는 금액은 오른쪽 끝 숫자일 때만 금액", () => {
    const r = parseCardCapture(
      [
        { text: "KFC AMALL 500", bbox: { x0: 40, x1: 900, y0: 100, y1: 130 } },
        { text: "22.1.27 · 일시불", bbox: { x0: 40, x1: 300, y0: 150, y1: 180 } },
        { text: "KFCRAAMALL 5002", bbox: { x0: 40, x1: 902, y0: 200, y1: 230 } },
        { text: "가맹점번호 500", bbox: { x0: 40, x1: 500, y0: 300, y1: 330 } },
        { text: "전자수입인지 8,500원", bbox: { x0: 40, x1: 905, y0: 400, y1: 430 } },
      ],
      TODAY,
    );
    expect(brief(r).map((i) => [i.merchant, i.amount])).toEqual([
      ["KFC AMALL", 500],
      ["KFCRAAMALL", 500],
      ["전자수입인지", 8500],
    ]);
  });

  it("알림 목록: 가맹점(+시각)이 금액 위 줄, 금액 옆 '일반승인', 아래 승인 문자·누적", () => {
    const r = parseCardCapture(
      lines([
        [280, 50, "2026. 11. 4(수)"],
        [400, 50, "구글페이먼트코리아유한회사"],
        [400, 780, "11:30"],
        [460, 50, "14,900원 · 일반승인"],
        [515, 50, "홍길동 님, 현대 네이버 승인 일시불, 11/4 11:30"],
        [565, 50, "누적2,247,694원"],
        [690, 50, "후불교통카드 이용내역 안내"],
        [690, 780, "10:40"],
        [820, 50, "네이버페이"],
        [820, 800, "9:51"],
        [880, 50, "22,800원 · 일반승인"],
        [935, 50, "홍길동 님, 현대 네이버 승인 일시불, 11/4 9:51"],
        [985, 50, "누적2,232,794원"],
        [1160, 50, "2026. 11. 3(화)"],
        [1560, 50, "더벤티문정점"],
        [1560, 790, "8:44"],
        [1620, 50, "10,5303 일반승인"],
        [1675, 50, "홍길동 님, 현대 네이버 승인 일시불, 11/3 8:44"],
        [1800, 50, "& 실물 카드 없이 차 안에서 바로 결제"],
      ]),
      TODAY,
    );
    expect(r.issuer).toBe("현대카드");
    expect(brief(r)).toEqual([
      { date: "2026-11-04", merchant: "구글페이먼트코리아유한회사", amount: 14900, status: "approved", installment: 1 },
      { date: "2026-11-04", merchant: "네이버페이", amount: 22800, status: "approved", installment: 1 },
      { date: "2026-11-03", merchant: "더벤티문정점", amount: 10530, status: "approved", installment: 1 },
    ]);
  });

  it("상태 표시줄 숫자·한도 초과 안내 문장은 결제가 아니다", () => {
    const r = parseCardCapture(
      lines([
        [40, 100, "4:04 표 all 56"],
        [40, 780, "56"],
        [1100, 50, "2026. 11. 1(일)"],
        [1200, 50, "도스트"],
        [1200, 780, "17:06"],
        [1260, 50, "10,600원 · 일반승인"],
        [1315, 50, "홍길동 님, 현대 네이버 승인 일시불, 1171 17:06"],
        [1365, 50, "누적2,073,724원"],
        [1490, 50, "1회 이용 금액이 계획했던"],
        [1550, 50, "100,000원을 초과했어요"],
        [1680, 50, "세인트플래닝"],
        [1680, 780, "16:56"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([["2026-11-01", "도스트", 10600]]);
  });

  it("'누적'이 깨져 읽힌 누적 금액·'일만승인' 오인식", () => {
    const r = parseCardCapture(
      lines([
        [1300, 50, "쿠팡"],
        [1300, 780, "7:52"],
        [1420, 50, "38,690원 일반승인"],
        [1535, 50, "홍길동 님, 현대 네이버 승인 일시불, 11/1 7:52"],
        [1640, 50, "누적1`337,124원"],
        [2460, 50, "맥도날드서울태릉입구역ㅁ점"],
        [2460, 780, "0:59"],
        [2580, 50, "11,000원 일만승인"],
        [2690, 50, "홍길동 님, 현대 네이버 승인 일시불, 11/1 0:58"],
        [2790, 50, "+%1,292,084%"],
        [3150, 50, "2026.10. 31(E)"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([
      ["2026-11-01", "쿠팡", 38690],
      ["2026-11-01", "맥도날드서울태릉입구역ㅁ점", 11000],
    ]);
  });

  it("승인 문자 속 '11/1' 이 '1171' 로 읽혀도 날짜", () => {
    const r = parseCardCapture(
      lines([
        [610, 50, "세인트플래닝"],
        [610, 780, "16:56"],
        [730, 50, "726,000원 일반승인"],
        [845, 50, "홍길동 님, 현대 네이버 승인 일시불, 1171 16:56"],
        [945, 50, "누적2,063,124원"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([["2026-11-01", "세인트플래닝", 726000]]);
  });

  it("상태 표시줄 '56 @', 요일이 깨진 날짜 머리글, 결제대행사 이름", () => {
    const r = parseCardCapture(
      lines([
        [60, 100, "4:05 N\\ all 56 @"],
        [180, 50, "< 이용 내역 내역 선택"],
        [300, 50, "최근순 고액순 = Q"],
        [400, 50, "26.11. 3 (3h"],
        [520, 50, "네이버파이낸셜(주) - 안다르"],
        [520, 700, "71,000원"],
        [585, 50, "일시불 · 네이버 현대카드"],
        [645, 50, "적립 예정 710(1.0%)"],
        [1220, 50, "26. 11. 2 (월)"],
        [1340, 50, "밀숲문정점"],
        [1340, 700, "27,000원"],
        [1405, 50, "일시불 · 네이버 현대카드"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([
      ["2026-11-03", "안다르", 71000],
      ["2026-11-02", "밀숲문정점", 27000],
    ]);
  });

  it("건 없이 보조 줄만 나오면 그 위 구간을 '놓친 줄'로 알려 준다", () => {
    const r = parseCardCapture(
      lines([
        [3173, 114, "26. 11. 1(일)"],
        [3527, 114, "일시불 ㆍ네이버 현대카드"],
        [3650, 113, "적립 예정 7260(1.0%)"],
      ]),
      TODAY,
    );
    expect(r.items).toEqual([]);
    expect(r.gaps).toEqual([{ x0: 105, y0: 3203, x1: 322, y1: 3527 }]);
    expect(parseCardCapture("26. 11. 1(일)\n일시불 · 네이버 현대카드", TODAY).gaps).toEqual([]);
  });

  it("가맹점 위 줄 + 날짜·시각·금액이 한 줄 (IBK 체크카드), '…21건' 가맹점", () => {
    const r = parseCardCapture(
      lines([
        [1351, 120, "|         6525문정현대^동점"],
        [1455, 279, "26.11.04 | 12:29 ㅣ 국내체크일시불         4,800원"],
        [2191, 120, "|        교통-지하철21건"],
        [2298, 279, "26.11.04 | 03:50 | 국내일시불                      35,850원"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount, i.installment])).toEqual([
      ["2026-11-04", "6525문정현대A동점", 4800, 1],
      ["2026-11-04", "교통-지하철21건", 35850, 1],
    ]);
  });

  it("IBK 목록 아랫부분: 할인 줄로 금액이 밀림, 날짜 숫자·점 빠짐, 잘린 맨 위 건", () => {
    const r = parseCardCapture(
      lines([
        [60, 250, "all 5G"],
        [200, 250, "_ 카드이용내역"],
        [580, 279, "26.1.03 | 12:05 | 국내체크일시불 10,000원"],
        [945, 278, "네이버페이"],
        [1000, 279, "261102 | 12:44 |국내체크일시불 114,780원"],
        [1365, 278, "6525문정현대A동점"],
        [1420, 279, "26.1.02 |12:36 | 국내체크일시불 4,800원"],
        [1780, 276, "교통-지하철13건"],
        [1840, 279, "26.10.22 | 03:43 | 국내일시불"],
        [1900, 276, "할인 800원 22,450원"],
        [2290, 276, "교통-버스2건"],
        [2350, 279, "26.10.14|04:07 |국내일시불"],
        [2410, 276, "할인 200원 3,000원"],
        [2980, 120, "꼭 확인해 주세요!"],
      ]),
      TODAY,
    );
    expect(brief(r).map((i) => [i.date, i.merchant, i.amount])).toEqual([
      ["2026-11-03", null, 10000],
      ["2026-11-02", "네이버페이", 114780],
      ["2026-11-02", "6525문정현대A동점", 4800],
      ["2026-10-22", "교통-지하철13건", 22450],
      ["2026-10-14", "교통-버스2건", 3000],
    ]);
  });

  it("날짜·가맹점·할부가 하나라도 없거나 인식이 불확실하면 등록 후보에서 빼고 사유를 남긴다", () => {
    const r = parseCardCapture(
      [
        { text: "26.11.03 | 12:05 | 국내일시불 10,000원", bbox: { x0: 279, x1: 1724, y0: 557, y1: 629 }, confidence: 80 }, // 가맹점 잘림
        { text: "네이버페이", bbox: { x0: 119, x1: 583, y0: 870, y1: 952 }, confidence: 71 },
        { text: "26.11.02 | 12:44 | 국내일시불 114,780원", bbox: { x0: 119, x1: 1724, y0: 977, y1: 1048 }, confidence: 83 },
        { text: "교통-버스2건", bbox: { x0: 119, x1: 662, y0: 1290, y1: 1355 }, confidence: 67 },
        { text: "26.10.14 | 04:07 | 국내일시불", bbox: { x0: 278, x1: 930, y0: 1400, y1: 1447 }, confidence: 89 },
        { text: "할인 200원 3,000원", bbox: { x0: 277, x1: 1724, y0: 1480, y1: 1552 }, confidence: 92 },
        { text: "KFCRAAMALL 5002", bbox: { x0: 120, x1: 1724, y0: 1700, y1: 1770 }, confidence: 12 },
        { text: "22.1.27 · 일시불", bbox: { x0: 117, x1: 637, y0: 1800, y1: 1860 }, confidence: 93 },
        { text: "도스트", bbox: { x0: 119, x1: 400, y0: 2000, y1: 2065 }, confidence: 90 },
        { text: "10,600원", bbox: { x0: 119, x1: 600, y0: 2100, y1: 2170 }, confidence: 90 }, // 날짜·할부 없음
      ],
      TODAY,
    );
    expect(r.items.map((i) => [i.date, i.merchant, Number(i.amount), i.installment])).toEqual([
      ["2026-11-02", "네이버페이", 114780, 1],
    ]);
    expect(r.rejected.map((x) => [Number(x.item.amount), x.reasons])).toEqual([
      [10000, ["가맹점 없음"]],
      [3000, ["교통 합계 — 따로 기록"]], // 날짜·할부는 제대로 읽혔지만 교통 합계라 뺀다
      [500, ["인식 불확실(12)"]],
      [10600, ["날짜 없음", "할부 정보 없음"]],
    ]);
  });

  it("결제 문자 캡처: 금액 → 날짜 → 가맹점, 머리글·카드 줄·가린 이름은 가맹점 아님, 체크카드는 일시불", () => {
    const L = (y: number, text: string, confidence = 90) => ({ text, bbox: { x0: 141, x1: 840, y0: y, y1: y + 60 }, confidence });
    const r = parseCardCapture(
      [
        { text: "비씨카드", bbox: { x0: 771, x1: 1033, y0: 574, y1: 644 }, confidence: 84 },
        { text: "(그저께) 오후 12:37", bbox: { x0: 719, x1: 1124, y0: 778, y1: 826 }, confidence: 94 },
        L(918, "[\/66발신]"),
        L(996, "18기업80(2017)체크승인"),
        L(1074, "홍*동님"),
        L(1152, "4,800원"),
        L(1234, "11/02 12:36"),
        L(1307, "6525문정현대^^동점"),
        L(1522, "[Web발신]"),
        L(1600, "IBK기업BC(2017)체크승인"),
        L(1678, "홍*동님"),
        L(1759, "114,780원"),
        L(1838, "11/02 12:44"),
        L(1911, "네이버페이"),
        { text: "(어제) 오후 12:05", bbox: { x0: 739, x1: 1103, y0: 2096, y1: 2144 }, confidence: 93 },
        L(2236, "[Web발신]"),
        L(2314, "IBK기업BC(2017)체크승인"),
        L(2392, "홍*동님"),
        L(2472, "10,000원"),
        L(2552, "11/03 12:05"),
        L(2625, "탕화쿵푸마라탕"),
      ],
      TODAY,
    );
    expect(r.issuer).toBe("BC카드");
    expect(r.items.map((i) => [i.date, i.merchant, Number(i.amount), i.installment])).toEqual([
      ["2026-11-02", "6525문정현대A동점", 4800, 1],
      ["2026-11-02", "네이버페이", 114780, 1],
      ["2026-11-03", "탕화쿵푸마라탕", 10000, 1],
    ]);
    expect(r.rejected).toEqual([]);
  });

  it("결제 문자: 깨진 머리글 줄은 가맹점 아님, 매출접수 '(10월31일기준)' 은 그 건의 날짜", () => {
    const L = (y: number, text: string, confidence = 90) => ({ text, bbox: { x0: 141, x1: 840, y0: y, y1: y + 60 }, confidence });
    const r = parseCardCapture(
      [
        L(690, "|<기업80(2017)체크승인"),
        L(767, "홍*동님"),
        L(848, "4,800원"),
        L(927, "11/03 14:11"),
        L(1000, "6525문정현대^동점"),
        L(1390, "[Web발신]"),
        L(1467, "18기업80(2017)매출접수"),
        L(1545, "홍*동님"),
        L(1623, "35,850원"),
        L(1701, "(10월31일기준)"),
        L(1778, "교통-지하철21건"),
        L(2168, "[Web", 0),
        L(2245, "IBKZ|BC(2017)d|25¢2l", 0),
        L(2323, "홍*동님"),
        L(2401, "24,200원"),
        L(2483, "11/04 11:31"),
        L(2557, "네이버페이"),
      ],
      TODAY,
    );
    expect(r.items.map((i) => [i.date, i.merchant, Number(i.amount)])).toEqual([
      ["2026-11-03", "6525문정현대A동점", 4800],
      ["2026-11-04", "네이버페이", 24200],
    ]);
    // 매출접수(교통 합계)는 날짜·가맹점까지 읽되 등록하지 않는다
    expect(r.rejected.map((x) => [x.item.date, x.item.merchant, Number(x.item.amount), x.reasons])).toEqual([
      ["2026-10-31", "교통-지하철21건", 35850, ["교통 합계 — 따로 기록"]],
    ]);
  });

  it("한글 줄을 영문 찌꺼기로 읽은 줄 판정", () => {
    const box = { x0: 0, x1: 100, y0: 0, y1: 20 };
    expect(looksLikeMisreadKorean({ text: "ElelEEnRetE", bbox: box, confidence: 2 })).toBe(true);
    expect(looksLikeMisreadKorean({ text: "WORLDTRIPS", bbox: box, confidence: 68 })).toBe(false);
    expect(looksLikeMisreadKorean({ text: "탕화쿵푸마라탕", bbox: box, confidence: 10 })).toBe(false);
    expect(looksLikeMisreadKorean({ text: "26.11.03 12:05", bbox: box, confidence: 10 })).toBe(false);
  });

  it("요약 이름과 금액이 다른 줄이어도 건으로 보지 않고, 가맹점 '카카오T'는 카드사가 아니다", () => {
    const r = parseCardCapture(
      lines([
        [100, 40, "11월 이용금액"],
        [150, 40, "186,300원"],
        [250, 40, "11.01 (토)"],
        [320, 40, "카카오T 택시"],
        [320, 700, "8,700원"],
      ]),
      TODAY,
    );
    expect(r.issuer).toBeNull();
    expect(r.skipped).toEqual(["11월 이용금액 186,300원"]);
    expect(brief(r).map((i) => [i.merchant, i.amount])).toEqual([["카카오T 택시", 8700]]);
  });
});
