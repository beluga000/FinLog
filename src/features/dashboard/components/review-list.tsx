"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BalanceForm } from "@/features/accounts/components/account-dialogs";
import { confirmTransaction } from "@/features/ledger/actions";
import { TxFormDialog, type AccountOption, type TxDraft } from "@/features/ledger/components/tx-form";
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

      <TxFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        accounts={accounts}
        categories={categories}
        viewerId={viewerId}
        isCouple={isCouple}
      />
      <TxFormDialog
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
