import { describe, expect, it } from "vitest";
import { parseCardMessage } from "../card-message";

const today = "2026-10-30";

/**
 * 대표 형태 예시 — 실제 카드사 원문은 사용자 샘플을 받는 대로 추가한다.
 * (이름·카드번호는 마스킹된 형태)
 */
describe("카드 승인 문자 파서 (AC-21)", () => {
  it("한 줄형: 카드사(끝4자리)승인 이름 금액(일시불)날짜 시각 가맹점 누적", () => {
    const p = parseCardMessage("[Web발신]\n신한카드(1234)승인 홍*동 12,000원(일시불)10/30 14:22 스타벅스 누적1,234,567원", today);
    expect(p).toEqual({
      kind: "approval",
      amount: 12_000n,
      date: "2026-10-30",
      merchant: "스타벅스",
      issuer: "신한카드",
      installment: 1,
    });
  });

  it("여러 줄형: 금액·날짜·가맹점이 각 줄", () => {
    const p = parseCardMessage("[Web발신]\nKB국민카드1234승인\n홍*동님\n54,000원 일시불\n10/29 19:05\n동네 식당\n누적567,000원", today);
    expect(p).toMatchObject({ kind: "approval", amount: 54_000n, date: "2026-10-29", merchant: "동네 식당", issuer: "KB국민카드" });
  });

  it("할부 개월 수", () => {
    const p = parseCardMessage("현대카드 승인\n홍*동\n1,200,000원 3개월\n10/28 11:00\n전자랜드\n누적2,000,000원", today);
    expect(p).toMatchObject({ amount: 1_200_000n, installment: 3, merchant: "전자랜드", issuer: "현대카드" });
  });

  it("누적 금액이 먼저 나와도 결제 금액을 고른다", () => {
    const p = parseCardMessage("삼성카드 누적 980,000원\n삼성1234승인 홍*동\n8,500원 일시불\n10/30 08:10 GS25", today);
    expect(p).toMatchObject({ amount: 8_500n, merchant: "GS25", issuer: "삼성카드" });
  });

  it("취소 문자는 cancel 로 구분", () => {
    const p = parseCardMessage("[Web발신]\n신한카드(1234)승인취소 홍*동 12,000원 10/30 15:00 스타벅스", today);
    expect(p.kind).toBe("cancel");
    expect(p.amount).toBe(12_000n);
  });

  it("오늘보다 뒤 날짜면 작년으로 본다", () => {
    expect(parseCardMessage("롯데카드 승인 5,000원 12/31 23:50 편의점", "2027-01-02").date).toBe("2026-12-31");
  });

  it("카드 문자가 아니면 unknown 이고 아무것도 채우지 않는다", () => {
    expect(parseCardMessage("오늘 저녁 뭐 먹을래?", today)).toMatchObject({ kind: "unknown", amount: null, date: null, merchant: null });
    expect(parseCardMessage("", today).kind).toBe("unknown");
  });
});
