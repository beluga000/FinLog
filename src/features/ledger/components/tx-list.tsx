"use client";

import { useState } from "react";
import { EyeOff, Lock, Repeat } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import type { CategoryRow, TxRow } from "../queries";
import { TxFormDialog, type AccountOption } from "./tx-form";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WEEKDAY[w]}요일`;
}

/** 금액 부호: 가계 밖으로 나가는 돈(지출)은 −, 들어오는 돈(수입)은 +, 내부 이동은 부호 없음 */
function signed(tx: TxRow): { value: bigint; className?: string } {
  if (tx.type === "EXPENSE") return { value: -tx.amount };
  if (tx.type === "INCOME") return { value: tx.amount, className: "text-good" };
  return { value: tx.amount, className: "text-muted-foreground" };
}

function flowText(tx: TxRow) {
  if (tx.type === "EXPENSE") return tx.fromAccountName;
  if (tx.type === "INCOME") return tx.toAccountName;
  if (tx.type === "ADJUSTMENT") return `${tx.toAccountName ?? tx.fromAccountName} ${tx.toAccountId ? "증가" : "감소"}`;
  return `${tx.fromAccountName} → ${tx.toAccountName}`;
}

export function TxList({
  items,
  accounts,
  categories,
  viewerId,
  isCouple,
  partnerName,
}: {
  items: TxRow[];
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  partnerName: string;
}) {
  const [editing, setEditing] = useState<TxRow | null>(null);
  const groups = new Map<string, TxRow[]>();
  for (const tx of items) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx]);

  if (!items.length) {
    return <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">기록이 없어요. 오른쪽 아래 + 버튼으로 기록해 보세요.</p>;
  }

  return (
    <>
      <div className="grid gap-4">
        {[...groups.entries()].map(([date, txs]) => {
          const dayExpense = txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0n);
          return (
            <section key={date} aria-label={dayLabel(date)}>
              <div className="mb-1 flex items-baseline justify-between px-1 text-xs text-muted-foreground">
                <span>{dayLabel(date)}</span>
                {dayExpense > 0n ? <span>지출 <Money value={dayExpense} /></span> : null}
              </div>
              <ul className="divide-y rounded-xl border">
                {txs.map((tx) => {
                  const s = signed(tx);
                  const partner = tx.createdByUserId !== viewerId;
                  return (
                    <li key={tx.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(tx)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {tx.categoryName ?? TX_TYPE_META[tx.type].label}
                            {tx.merchant ? <span className="truncate font-normal text-muted-foreground">· {tx.merchant}</span> : null}
                          </div>
                          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {tx.recurringRuleId ? <Repeat className="size-3" aria-label="정기 거래" /> : null}
                            {tx.visibility === "PRIVATE" ? <Lock className="size-3" aria-label="비공개" /> : null}
                            {tx.visibility === "SUMMARY_ONLY" ? <EyeOff className="size-3" aria-label="합계만 공개" /> : null}
                            <span className="truncate">{flowText(tx)}</span>
                            {isCouple && partner ? <span className="shrink-0 rounded bg-muted px-1">{partnerName}</span> : null}
                          </div>
                        </div>
                        <Money value={s.value} className={cn("shrink-0 text-sm font-semibold", s.className)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <TxFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        accounts={accounts}
        categories={categories}
        viewerId={viewerId}
        isCouple={isCouple}
      />
    </>
  );
}
