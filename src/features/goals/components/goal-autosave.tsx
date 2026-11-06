"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { createRecurringRule } from "@/features/ledger/actions";
import { SAVING_DESTINATION_TYPES } from "@/lib/finance/balance";
import { todayKST } from "@/lib/finance/period";
import type { AccountType, DateStr } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { setGoalCommit } from "../actions";

export interface AutoSaveSetup {
  fromAccountId: string | null;
  day: number;
  existing: { name: string; amount: number; day: number }[];
}

interface Acc {
  id: string;
  name: string;
  type: AccountType;
}

const NOT_SAVING: AccountType[] = ["CREDIT_CARD", "LOAN"];

/** 목표 상세 — 매달 필요한 금액을 연결 계좌로 가는 정기 저축으로 등록 */
export function AutoSaveButton({
  goal,
  accounts,
  setup,
  monthly,
}: {
  goal: { id: string; name: string; targetDate: DateStr; linkedAccountIds: string[]; committed: boolean };
  accounts: Acc[];
  setup: AutoSaveSetup;
  monthly: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        자동이체로 등록
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>자동이체 만들기</DialogTitle>
            <DialogDescription>매달 정한 날에 가계부에 저축 기록이 자동으로 남아요.</DialogDescription>
          </DialogHeader>
          {open ? <AutoSaveForm goal={goal} accounts={accounts} setup={setup} monthly={monthly} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AutoSaveForm({
  goal,
  accounts,
  setup,
  monthly,
  onDone,
}: {
  goal: { id: string; name: string; targetDate: DateStr; linkedAccountIds: string[]; committed: boolean };
  accounts: Acc[];
  setup: AutoSaveSetup;
  monthly: number;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const usable = accounts.filter((a) => !NOT_SAVING.includes(a.type));
  const linked = usable.filter((a) => goal.linkedAccountIds.includes(a.id));
  const toChoices = linked.length ? linked : usable;
  const [to, setTo] = useState(toChoices[0]?.id ?? "");
  const fromDefault =
    (setup.fromAccountId && setup.fromAccountId !== to ? setup.fromAccountId : null) ??
    usable.find((a) => a.type === "CHECKING" && a.id !== to)?.id ??
    usable.find((a) => a.id !== to)?.id ??
    "";
  const [from, setFrom] = useState(fromDefault);
  const [amount, setAmount] = useState(String(Math.max(0, Math.round(monthly))));
  const [day, setDay] = useState(setup.day);
  const [commit, setCommit] = useState(!goal.committed);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!from || !to) return setError("보내는 계좌와 받는 계좌를 골라 주세요.");
    if (from === to) return setError("보내는 계좌와 받는 계좌가 같아요.");
    if (!Number(amount)) return setError("금액을 적어 주세요.");
    // 저축·투자는 예적금·투자 같은 계좌로만 — 통장으로 모으는 목표면 이체로 남긴다
    const toType = usable.find((a) => a.id === to)?.type;
    const type = toType && SAVING_DESTINATION_TYPES.includes(toType) ? "SAVE_INVEST" : "TRANSFER";
    start(async () => {
      const r = await createRecurringRule({
        name: `${goal.name} 저축`,
        tx: {
          type,
          amount,
          fromAccountId: from,
          toAccountId: to,
          categoryId: null,
          merchant: null,
          memo: null,
          visibility: null,
          isFixed: false,
        },
        dayOfMonth: day,
        businessDayAdjust: "NONE",
        startDate: todayKST(),
        endDate: goal.targetDate,
      });
      if (!r.ok) return setError(r.error);
      if (commit) await setGoalCommit(goal.id, amount);
      toast.success(commit ? "자동이체를 만들고 매달 넣을 금액으로 확정했어요" : "자동이체를 만들었어요");
      onDone();
    });
  }

  if (usable.length < 2) {
    return <p className="text-sm text-muted-foreground">자동이체를 만들려면 자산 계좌가 2개 이상 있어야 해요. 자산 화면에서 계좌를 먼저 등록해 주세요.</p>;
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {setup.existing.length ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          이미 이 목표 계좌로 가는 자동이체가 있어요:{" "}
          {setup.existing.map((r, i) => (
            <span key={i}>
              {i > 0 ? ", " : ""}
              {r.name} <Money value={r.amount} compact />
            </span>
          ))}
          . 겹치지 않는지 확인해 주세요.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="보내는 계좌" htmlFor="autosave-from">
          <NativeSelect id="autosave-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABEL[a.type]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="받는 계좌" htmlFor="autosave-to" hint={linked.length ? "목표에 연결된 계좌예요." : undefined}>
          <NativeSelect id="autosave-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {toChoices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABEL[a.type]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="매달 금액" htmlFor="autosave-amount">
        <AmountInput id="autosave-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="이체일" htmlFor="autosave-day" hint={setup.fromAccountId ? "월급 들어오는 날 다음 날로 골라 뒀어요." : undefined}>
        <NativeSelect id="autosave-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              매달 {d}일
            </option>
          ))}
          <option value={0}>매달 말일</option>
        </NativeSelect>
      </Field>
      <p className="text-xs text-muted-foreground">
        오늘부터 목표일({goal.targetDate.replaceAll("-", ".")})까지 반복해요. 정기 거래 화면에서 언제든 바꾸거나 멈출 수 있어요.
      </p>
      {!goal.committed ? (
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={commit} onChange={(e) => setCommit(e.target.checked)} className="mt-0.5" />
          <span>이 금액을 목표에 매달 넣을 금액으로 확정</span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "만드는 중…" : "자동이체 만들기"}
      </Button>
    </form>
  );
}
