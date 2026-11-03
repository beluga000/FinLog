import { describe, expect, it } from "vitest";
import { normalizeBilling, ownerChoiceOf, resolveOwner, visibilityError } from "./rules";

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
