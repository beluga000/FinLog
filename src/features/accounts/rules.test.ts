import { describe, expect, it } from "vitest";
import { normalizeBilling, normalizeLoan, normalizeSavings, ownerChoiceOf, resolveOwner, visibilityError } from "./rules";

const ctx = { userId: "A", partnerId: "B" };

describe("계좌 명의", () => {
  it("명의 선택을 사용자 id 로 바꾼다", () => {
    expect(resolveOwner("me", ctx)).toEqual({ ok: true, ownerUserId: "A" });
    expect(resolveOwner("partner", ctx)).toEqual({ ok: true, ownerUserId: "B" });
    expect(resolveOwner("joint", ctx)).toEqual({ ok: true, ownerUserId: null });
  });

  it("배우자가 없으면 배우자 명의로 등록할 수 없다", () => {
    expect(resolveOwner("partner", { userId: "A", partnerId: null }).ok).toBe(false);
  });

  it("보는 사람 기준으로 명의를 표시한다", () => {
    expect(ownerChoiceOf("A", "A")).toBe("me");
    expect(ownerChoiceOf("A", "B")).toBe("partner");
    expect(ownerChoiceOf(null, "B")).toBe("joint");
  });

  it("비공개는 명의자 본인만", () => {
    expect(visibilityError("A", "A", "PRIVATE")).toBeNull();
    expect(visibilityError("B", "A", "PRIVATE")).not.toBeNull();
    expect(visibilityError(null, "A", "PRIVATE")).not.toBeNull();
    expect(visibilityError("B", "A", "SUMMARY_ONLY")).toBeNull();
  });
});

describe("카드 결제 정보", () => {
  it("카드가 아니면 결제일·출금계좌를 비운다", () => {
    expect(normalizeBilling("CHECKING", { billingDay: 15, paymentAccountId: "x" })).toEqual({ billingDay: null, paymentAccountId: null });
    expect(normalizeBilling("CREDIT_CARD", { billingDay: 15, paymentAccountId: "" })).toEqual({ billingDay: 15, paymentAccountId: null });
  });
});

describe("예적금 상품 정보", () => {
  it("정책형 적금: 상품·구간 확인, 상품이 없으면 구간도 비운다", () => {
    const base = { openedOn: null, maturityDate: null, interestRatePct: null };
    expect(normalizeSavings("SAVINGS", { ...base, savingsProduct: "YOUTH_FUTURE", savingsTier: "PREFERRED" })).toMatchObject({
      ok: true,
      savingsProduct: "YOUTH_FUTURE",
      savingsTier: "PREFERRED",
    });
    expect(normalizeSavings("SAVINGS", { ...base, savingsProduct: null, savingsTier: "PREFERRED" })).toMatchObject({ savingsTier: null });
    expect(normalizeSavings("SAVINGS", { ...base, savingsProduct: "ETC" }).ok).toBe(false);
    expect(normalizeSavings("SAVINGS", { ...base, savingsProduct: "YOUTH_LEAP", savingsTier: "PREFERRED" }).ok).toBe(false);
  });

  it("저축 통장만 저장하고 금리는 % → 비율", () => {
    expect(normalizeSavings("SAVINGS", { openedOn: "2026-01-10", maturityDate: "2027-01-10", interestRatePct: 3.55 })).toEqual({
      ok: true,
      openedOn: "2026-01-10",
      maturityDate: "2027-01-10",
      interestRate: 0.0355,
      savingsProduct: null,
      savingsTier: null,
    });
    expect(normalizeSavings("CHECKING", { openedOn: "2026-01-10", maturityDate: "2027-01-10", interestRatePct: 3 })).toEqual({
      ok: true,
      openedOn: null,
      maturityDate: null,
      interestRate: null,
      savingsProduct: null,
      savingsTier: null,
    });
  });

  it("만기일이 가입일보다 앞서면 거절", () => {
    expect(normalizeSavings("SAVINGS", { openedOn: "2027-01-10", maturityDate: "2026-01-10", interestRatePct: null }).ok).toBe(false);
  });
});

describe("대출 정보", () => {
  it("납입일·출금 계좌·기간·금리를 대출에도 저장한다", () => {
    expect(normalizeBilling("LOAN", { billingDay: 25, paymentAccountId: "bank" })).toEqual({ billingDay: 25, paymentAccountId: "bank" });
    expect(normalizeSavings("LOAN", { openedOn: "2025-01-10", maturityDate: "2030-01-10", interestRatePct: 4.25, savingsProduct: "YOUTH_LEAP" })).toEqual({
      ok: true,
      openedOn: "2025-01-10",
      maturityDate: "2030-01-10",
      interestRate: 0.0425,
      savingsProduct: null,
      savingsTier: null,
    });
    expect(normalizeSavings("LOAN", { openedOn: "2030-01-10", maturityDate: "2025-01-10", interestRatePct: null })).toEqual({
      ok: false,
      error: "만기일은 대출일보다 뒤여야 해요.",
    });
  });

  it("상환 방식·보증금 대출은 대출만, 모르는 상환 방식은 거절", () => {
    expect(normalizeLoan("LOAN", { loanRepayment: "BULLET", depositLoan: true })).toEqual({ ok: true, loanRepayment: "BULLET", depositLoan: true });
    expect(normalizeLoan("LOAN", { loanRepayment: null, depositLoan: false })).toEqual({ ok: true, loanRepayment: null, depositLoan: false });
    expect(normalizeLoan("CHECKING", { loanRepayment: "BULLET", depositLoan: true })).toEqual({ ok: true, loanRepayment: null, depositLoan: false });
    expect(normalizeLoan("LOAN", { loanRepayment: "WEEKLY", depositLoan: false }).ok).toBe(false);
  });
});
