"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountOption, TxDraft } from "@/features/ledger/components/tx-form";
import { LazyTxFormDialog, preloadTxForm } from "@/features/ledger/components/tx-form-lazy";
import type { CategoryRow } from "@/features/ledger/queries";
import { SAVING_DESTINATION_TYPES } from "@/lib/finance/balance";
import { withRo } from "@/lib/labels";

export interface MoveTarget {
  goalName: string;
  toAccountId: string;
  /** 보내는 계좌 기본값 — 정기 수입이 가장 많이 들어오는 통장 */
  fromAccountId: string | null;
}

/**
 * 남은 돈을 목표 계좌로 옮기는 기록 — 저축·투자(예적금·투자 계좌) 또는 이체(통장으로 모으는 목표)를 미리 채워 연다.
 * 실제 송금은 은행 앱에서 하고, 여기서는 기록만 남긴다.
 */
export function MoveToGoalButton({
  target,
  amount,
  label,
  accounts,
  categories,
  viewerId,
  isCouple,
  size = "sm",
  variant = "default",
}: {
  target: MoveTarget;
  amount: bigint;
  label: string;
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const to = accounts.find((a) => a.id === target.toAccountId);
  if (!to) return null;
  const from = target.fromAccountId && target.fromAccountId !== to.id ? target.fromAccountId : null;
  const open = () =>
    setDraft({
      type: SAVING_DESTINATION_TYPES.includes(to.type) ? "SAVE_INVEST" : "TRANSFER",
      amount,
      fromAccountId: from,
      toAccountId: to.id,
      memo: `${withRo(target.goalName)} 옮기기`,
    });
  return (
    <>
      <Button size={size} variant={variant} onClick={open} onPointerEnter={preloadTxForm} onTouchStart={preloadTxForm}>
        {label}
      </Button>
      <LazyTxFormDialog
        open={draft !== null}
        onOpenChange={(o) => !o && setDraft(null)}
        draft={draft}
        accounts={accounts}
        categories={categories}
        viewerId={viewerId}
        isCouple={isCouple}
      />
    </>
  );
}
