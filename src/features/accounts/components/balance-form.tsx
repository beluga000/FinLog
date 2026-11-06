"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isLiability } from "@/lib/finance/balance";
import { todayKST } from "@/lib/finance/period";
import type { AccountType } from "@/lib/finance/types";
import { recordBalance } from "../actions";

/** 잔액 맞추기 — 홈 "확인할 일"에서도 쓰므로 계좌 편집 창 묶음(account-dialogs)과 따로 둔다 */
export function BalanceForm({ id, type, current, onDone }: { id: string; type: AccountType; current: bigint; onDone: () => void }) {
  const [pending, start] = useTransition();
  const liability = isLiability(type);
  const [value, setValue] = useState((liability ? -current : current).toString());
  const [asOf, setAsOf] = useState(todayKST());
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await recordBalance(id, { balance: value || "0", asOf });
          if (!r.ok) return setError(r.error);
          toast.success("잔액을 맞췄어요");
          onDone();
        });
      }}
    >
      <Field label={liability ? "갚아야 할 금액" : "실제 잔액 (평가액)"} htmlFor="bal">
        <AmountInput id="bal" value={value} onChange={setValue} allowNegative={!liability} />
      </Field>
      <Field label="기준일" htmlFor="bal-date" hint="그날 마감 기준 잔액이에요. 기준일 이후 거래만 이어서 반영돼요.">
        <Input id="bal-date" type="date" max={todayKST()} value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
      </DialogFooter>
    </form>
  );
}
