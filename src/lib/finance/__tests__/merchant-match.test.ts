import { describe, expect, it } from "vitest";
import { cleanMerchant, isGenericMerchant, matchMerchant, similarity } from "../merchant-match";

describe("무엇을 샀는지 알 수 없는 사용처", () => {
  it("간편결제·결제대행·종합 쇼핑몰", () => {
    for (const n of ["네이버페이", "쿠팡", "쿠팡(주)", "쿠팡페이주식회사", "쿠팡 페이 주식회사", "카카오페이", "G마켓", "11번가", "토스페이먼츠", "ＳＳＧ.ＣＯＭ"]) {
      expect(isGenericMerchant(n), n).toBe(true);
    }
  });
  it("가게 이름은 아니다", () => {
    for (const n of ["GS25문정현대A동점", "스타벅스 강남역점", "쿠팡이츠 아님 맘스터치", "네이버페이 - 안다르", "", null]) {
      expect(isGenericMerchant(n), String(n)).toBe(false);
    }
  });
});

describe("가맹점 이름 보정", () => {
  it("인식 찌꺼기를 걷어낸다", () => {
    expect(cleanMerchant("WORLDTRIPS 8")).toBe("WORLDTRIPS");
    expect(cleanMerchant("ETR.mytrip_kr_LGRMJV ¥")).toBe("ETR.mytrip_kr_LGRMJV");
    expect(cleanMerchant("1『(강남구청역")).toBe("강남구청역");
    expect(cleanMerchant("쿠팡(주)")).toBe("쿠팡(주)");
    expect(cleanMerchant("GS25 역삼점")).toBe("GS25 역삼점");
    expect(cleanMerchant("AIRBNB * HMRJSEBD9S")).toBe("AIRBNB * HMRJSEBD9S");
    expect(cleanMerchant("맥도날드서울태릉입구역07점")).toBe("맥도날드서울태릉입구역DT점");
    expect(cleanMerchant("스타벅스구리0T점")).toBe("스타벅스구리DT점");
    expect(cleanMerchant("이마트24 역삼점")).toBe("이마트24 역삼점");
    expect(cleanMerchant("강남17점")).toBe("강남17점");
    expect(cleanMerchant('©" 네이버페이')).toBe("네이버페이");
    expect(cleanMerchant(". ㆍ 탕화쿵푸마라탕")).toBe("탕화쿵푸마라탕");
    expect(cleanMerchant("| 6525문정현대^^동점")).toBe("6525문정현대A동점");
  });

  it("이름 앞 브랜드가 헷갈리는 글자로 읽히면 고친다", () => {
    expect(matchMerchant("6525문정현대^동점").name).toBe("GS25문정현대A동점");
    expect(matchMerchant("GS25역삼점").name).toBe("GS25역삼점");
    expect(matchMerchant("6ㅎ525문정현대A동점").name).toBe("GS25문정현대A동점");
    expect(matchMerchant("6마켓").name).toBe("G마켓");
    expect(matchMerchant("525문정현대A동점").name).toBe("GS25문정현대A동점"); // 첫 글자 G 가 빠짐
    expect(matchMerchant("S25역삼점").name).toBe("GS25역삼점");
    expect(matchMerchant("25시마트").name).toBe("25시마트"); // 두 글자 빠진 건 단정하지 않는다
    expect(matchMerchant("1234마트").name).toBe("1234마트"); // 비슷한 브랜드가 없으면 그대로
  });

  it("헷갈리는 글자(6↔G)는 거의 같은 글자로 본다", () => {
    expect(similarity("6마켓", "G마켓")).toBeGreaterThan(0.85);
    expect(similarity("7마켓", "G마켓")).toBeLessThan(0.7);
  });

  it("자주 쓰는 가맹점 목록으로 보정 (처음 쓰는 사람)", () => {
    expect(matchMerchant("6마켓")).toMatchObject({ name: "G마켓", matched: { source: "common" } });
    expect(matchMerchant("6525")).toMatchObject({ name: "GS25" });
  });

  it("과거에 기록한 가맹점으로 보정", () => {
    const history = ["KFC코엑스MALL", "KFC강남구청역", "스타벅스 강남역점"];
    expect(matchMerchant("KFCZAAMALL", history).name).toBe("KFC코엑스MALL");
    expect(matchMerchant("KFC AMALL", history).name).toBe("KFC코엑스MALL");
    expect(matchMerchant("1『(강남구청역", history).name).toBe("KFC강남구청역");
    expect(matchMerchant("맥도날드서울태릉입구역ㅁ점", ["맥도날드서울태릉입구역DT점"]).name).toBe("맥도날드서울태릉입구역DT점");
    expect(matchMerchant("스타벅스 강남역점", history)).toEqual({ name: "스타벅스 강남역점", matched: null });
  });

  it("비슷한 이름이 없으면 바꾸지 않는다 (처음 가는 가게)", () => {
    expect(matchMerchant("전자수입인지")).toEqual({ name: "전자수입인지", matched: null });
    expect(matchMerchant("WORLDTRIPS")).toEqual({ name: "WORLDTRIPS", matched: null });
    expect(matchMerchant("마켓").matched).toBeNull(); // 한 글자 빠진 짧은 이름은 단정하지 않는다
    expect(matchMerchant("CV").matched).toBeNull();
  });
});
