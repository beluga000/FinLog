"use client";

import { useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RecurringCandidate } from "@/lib/finance/recurring-detect";
import { dismissRecurringCandidate } from "../actions";
import type { CategoryRow } from "../queries";
import { NewRecurringButton } from "./recurring-controls";
import type { AccountOption } from "./tx-form";

interface FormEnv {
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
}

const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 정기 거래 화면 — 가계부에서 찾은 매달 반복되는 기록. 등록하면 이름·금액·날짜를 채운 입력 창이 열린다 */
export function RecurringCandidates({ candidates, formEnv }: { candidates: RecurringCandidate[]; formEnv: FormEnv }) {
  // "아니에요" 누른 것은 서버 응답 전에 바로 숨긴다
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const list = candidates.filter((c) => !hidden.has(c.key));
  if (!list.length) return null;

  const dismiss = (c: RecurringCandidate) => {
    setHidden((h) => new Set(h).add(c.key));
    start(async () => {
      const r = await dismissRecurringCandidate(c.key);
      if (!r.ok) {
        toast.error(r.error);
        setHidden((h) => {
          const next = new Set(h);
          next.delete(c.key);
          return next;
        });
      }
    });
  };

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-start gap-2">
          <Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="grid gap-0.5">
            <h2 className="text-sm font-semibold">매달 반복되는 기록을 찾았어요</h2>
            <p className="text-xs text-muted-foreground">최근 6달 가계부에서 찾았어요. 등록하면 다음부터 그날 자동으로 기록돼요.</p>
          </div>
        </div>
        <ul className="grid divide-y">
          {list.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{c.merchant}</span>
                  <span className="shrink-0 text-sm font-semibold">
                    {c.minAmount === c.maxAmount ? (
                      <Money value={c.amount} />
                    ) : (
                      <>
                        <Money value={c.minAmount} />~<Money value={c.maxAmount} />
                      </>
                    )}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.type === "INCOME" ? "들어옴" : "나감"} · 매달 {c.dayOfMonth}일쯤 · {c.months}달 · 마지막 {mmdd(c.lastDate)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => dismiss(c)}>
                  아니에요
                </Button>
                <NewRecurringButton
                  {...formEnv}
                  label="등록"
                  variant="outline"
                  size="sm"
                  defaultType={c.type}
                  draft={{
                    type: c.type,
                    amount: c.amount,
                    fromAccountId: c.fromAccountId,
                    toAccountId: c.toAccountId,
                    categoryId: c.categoryId,
                    merchant: c.merchant,
                    visibility: c.visibility,
                    recurring: { name: c.merchant, dayOfMonth: c.dayOfMonth, startDate: c.startDate },
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
