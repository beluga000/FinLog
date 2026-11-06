"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BalanceForm } from "@/features/accounts/components/balance-form";
import { confirmTransaction } from "@/features/ledger/actions";
import type { AccountOption, TxDraft } from "@/features/ledger/components/tx-form";
import { LazyTxFormDialog } from "@/features/ledger/components/tx-form-lazy";
import { formatCompactKRW } from "@/lib/finance/money";
import { todayKST } from "@/lib/finance/period";
import type { CategoryRow, TxRow } from "@/features/ledger/queries";
import type { ReviewItem } from "../home";

function shortDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

const QUESTION: Partial<Record<TxRow["type"], string>> = {
  INCOME: "들어왔나요?",
  EXPENSE: "빠져나갔나요?",
  SAVE_INVEST: "이체됐나요?",
  LOAN_REPAY: "상환됐나요?",
  TRANSFER: "이체됐나요?",
};

type BalanceItem = Extract<ReviewItem, { kind: "balance" }>;
type CardDueItem = Extract<ReviewItem, { kind: "cardDue" }>;

function dueLabel(due: string, today: string) {
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  return days > 0 ? `D-${days}` : days === 0 ? "오늘" : `${-days}일 지남`;
}

/** 카드 대금 결제 = 출금 계좌 → 카드 이체. 결제일 전이면 결제일로 예약, 지났으면 오늘 */
function cardPaymentDraft(item: CardDueItem, today: string): TxDraft {
  return {
    type: "TRANSFER",
    amount: item.card.toPay,
    date: item.date > today ? item.date : today,
    fromAccountId: item.payment?.id ?? null,
    toAccountId: item.card.id,
    memo: `${item.card.name} 대금`,
  };
}

type ShortfallItem = Extract<ReviewItem, { kind: "shortfall" }>;

/** 잔액 부족 → 여유 있는 통장에서 오늘 옮기는 이체 (기록만 미리 채운다) */
function shortfallDraft(item: ShortfallItem, today: string): TxDraft {
  return {
    type: "TRANSFER",
    amount: item.amount,
    date: today,
    fromAccountId: item.source?.id ?? null,
    toAccountId: item.account.id,
    memo: `${shortDate(item.date)} 부족분 미리 옮기기`,
  };
}

/** ④ 확인할 일 (§2-10) — 0건이면 블록 자체를 숨긴다 */
export function ReviewList({
  items,
  accounts,
  categories,
  viewerId,
  isCouple,
}: {
  items: ReviewItem[];
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [balance, setBalance] = useState<BalanceItem["account"] | null>(null);
  const [draft, setDraft] = useState<TxDraft | null>(null);
  if (!items.length) return null;
  const today = todayKST();

  const confirm = (id: string) =>
    start(async () => {
      const r = await confirmTransaction(id);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>확인할 일</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid divide-y">
          {items.map((item) =>
            item.kind === "recurring" ? (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">{shortDate(item.date)} · </span>
                  {item.tx.merchant ?? item.tx.categoryName ?? "정기 거래"} <Money value={item.tx.amount} className="font-semibold" />{" "}
                  {QUESTION[item.tx.type] ?? "맞나요?"}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => confirm(item.tx.id)}>
                    맞아요
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(item.tx)}>
                    금액 수정
                  </Button>
                </div>
              </li>
            ) : item.kind === "cardDue" ? (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">
                    {shortDate(item.date)} 결제 · {dueLabel(item.date, today)} ·{" "}
                  </span>
                  {item.card.name} <Money value={item.card.toPay} className="font-semibold" />
                  <span className="block text-xs text-muted-foreground">
                    {item.payment ? (
                      item.payment.balance < item.card.toPay ? (
                        <span className="text-destructive">
                          {item.payment.name} 잔액이 <Money value={item.card.toPay - item.payment.balance} /> 부족해요
                        </span>
                      ) : (
                        `${item.payment.name}에서 빠져나가요`
                      )
                    ) : (
                      "출금 계좌를 정하면 잔액이 충분한지 알려 드려요"
                    )}
                  </span>
                </p>
                <div>
                  <Button size="sm" variant="outline" onClick={() => setDraft(cardPaymentDraft(item, today))}>
                    결제 기록
                  </Button>
                </div>
              </li>
            ) : item.kind === "taxDeadline" ? (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">12월 31일까지 · {dueLabel(item.date, today)} · </span>
                  연금 세액공제 한도 <Money value={item.room} compact className="font-semibold" /> 남았어요
                  <span className="block text-xs text-muted-foreground">
                    채우면 연말정산에서{" "}
                    {item.refundOne !== null ? (
                      <Money value={item.refundOne} compact />
                    ) : (
                      <>
                        <Money value={item.refund[0]} compact />~<Money value={item.refund[1]} compact />
                      </>
                    )}{" "}
                    더 돌려받아요 (참고용 계산)
                  </span>
                </p>
                <div>
                  <Link href="/assets" className={buttonVariants({ size: "sm", variant: "outline" })}>
                    절세 한도 보기
                  </Link>
                </div>
              </li>
            ) : item.kind === "shortfall" ? (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">{shortDate(item.date)} · {dueLabel(item.date, today)} · </span>
                  {item.account.name} <Money value={item.amount} compact className="font-semibold" /> 모자랄 것 같아요
                  <span className="block text-xs text-muted-foreground">
                    {item.causes.map((c) => `${shortDate(c.date)} ${c.label} ${formatCompactKRW(c.amount)}`).join(" · ")}
                    {item.source ? `${item.causes.length ? " · " : ""}${item.source.name}에서 옮기면 돼요` : ""}
                  </span>
                </p>
                <div>
                  <Button size="sm" variant="outline" onClick={() => setDraft(shortfallDraft(item, today))}>
                    미리 옮기기 기록
                  </Button>
                </div>
              </li>
            ) : item.kind === "reconcile" ? (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  {item.payday ? "이번 달 잔액 맞추기 · 1분" : `잔액이 오래된 계좌가 ${item.stale}개예요`}
                  <span className="block text-xs text-muted-foreground">
                    {item.payday
                      ? `${shortDate(item.payday)} 월급이 들어왔어요. 통장 숫자와 다른 것만 고치면 돼요.`
                      : "한 화면에서 바뀐 것만 고치고 나머지는 그대로 넘겨요."}
                  </span>
                </p>
                <div>
                  <Link href="/assets/reconcile" className={buttonVariants({ size: "sm", variant: "outline" })}>
                    한 번에 맞추기
                  </Link>
                </div>
              </li>
            ) : (
              <li key={item.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  {item.account.name} 잔액을 업데이트할 때예요
                  <span className="block text-xs text-muted-foreground">
                    {item.date ? `마지막 입력 ${shortDate(item.date)}` : "입력한 잔액이 없어요"}
                  </span>
                </p>
                <div>
                  <Button size="sm" variant="outline" onClick={() => setBalance(item.account)}>
                    잔액 입력
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      </CardContent>

      <LazyTxFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        accounts={accounts}
        categories={categories}
        viewerId={viewerId}
        isCouple={isCouple}
      />
      <LazyTxFormDialog
        open={draft !== null}
        onOpenChange={(o) => !o && setDraft(null)}
        draft={draft}
        accounts={accounts}
        categories={categories}
        viewerId={viewerId}
        isCouple={isCouple}
      />
      <Dialog open={balance !== null} onOpenChange={(o) => !o && setBalance(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{balance?.name} 잔액 입력</DialogTitle>
            <DialogDescription className="sr-only">오늘 기준 실제 잔액을 입력합니다.</DialogDescription>
          </DialogHeader>
          {balance ? (
            <BalanceForm id={balance.id} type={balance.type} current={balance.balance} onDone={() => setBalance(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
