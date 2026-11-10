"use client";

import { useMemo, useState, useTransition } from "react";
import { EyeOff, Lock, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { findSuspectedDuplicates } from "@/lib/finance/merchant-rules";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import { markNotDuplicate } from "../actions";
import type { CategoryRow, TxRow } from "../queries";
import type { AccountOption } from "./tx-form";
import { LazyTxFormDialog } from "./tx-form-lazy";

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
  const [pending, startTransition] = useTransition();
  const duplicates = useMemo(() => findSuspectedDuplicates(items), [items]);
  // 묶음 안내·버튼은 목록에서 처음 나오는 기록 아래 한 번만
  const shown = new Set<string>();

  function notDuplicate(ids: string[]) {
    startTransition(async () => {
      const r = await markNotDuplicate(ids);
      if (r.ok) toast.success("다른 결제로 기억할게요");
      else toast.error(r.error);
    });
  }
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
                  const group = duplicates.get(tx.id);
                  const firstOfGroup = !!group && !shown.has(group[0]);
                  if (group) shown.add(group[0]);
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
                            {group ? (
                              <span className="shrink-0 rounded bg-warning/15 px-1 text-xs font-medium text-warning">같은 결제?</span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {tx.recurringRuleId ? <Repeat className="size-3" aria-label="정기 거래" /> : null}
                            {tx.visibility === "PRIVATE" ? <Lock className="size-3" aria-label="비공개" /> : null}
                            {tx.visibility === "SUMMARY_ONLY" ? <EyeOff className="size-3" aria-label="합계만 공개" /> : null}
                            {/* 메모(무엇을 샀는지)를 결제 수단보다 앞에 — "네이버페이"만으로는 알 수 없는 내용 */}
                            {tx.memo ? <span className="truncate text-foreground/80">{tx.memo} ·</span> : null}
                            <span className="truncate">{flowText(tx)}</span>
                            {isCouple && partner ? <span className="shrink-0 rounded bg-muted px-1">{partnerName}</span> : null}
                          </div>
                        </div>
                        <Money value={s.value} className={cn("shrink-0 text-sm font-semibold", s.className)} />
                      </button>
                      {firstOfGroup ? (
                        <div className="flex items-center gap-2 border-t border-dashed bg-warning/5 px-3 py-2 text-xs">
                          <p className="min-w-0 flex-1 text-muted-foreground">
                            같은 날 같은 곳에 비슷한 금액이 {group.length}건 있어요. 한 번 결제했다면 하나를 눌러 지우세요.
                          </p>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => notDuplicate(group)}
                            className="shrink-0 rounded-md border px-2 py-1 font-medium hover:bg-muted disabled:opacity-50"
                          >
                            다른 결제예요
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <LazyTxFormDialog
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
