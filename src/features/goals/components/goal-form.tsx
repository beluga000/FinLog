"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addDays, todayKST } from "@/lib/finance/period";
import { MODEL_ALLOCATIONS, portfolioMetrics, RISK_PROFILE_LABEL, RISK_PROFILES } from "@/lib/finance/portfolio";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import type { AccountType } from "@/lib/finance/types";
import { createGoal, updateGoal } from "../actions";

export interface GoalFormValue {
  id?: string;
  name: string;
  targetAmount: number;
  targetIsReal: boolean;
  targetDate: string;
  expectedReturn: number;
  linkedAccountIds: string[];
  monthlyCommit: number | null;
}

const PRESETS = RISK_PROFILES.map((p) => ({
  label: RISK_PROFILE_LABEL[p],
  rate: Math.round(portfolioMetrics(MODEL_ALLOCATIONS[p]).expectedReturn * 1000) / 1000,
}));

function yearsFromToday(years: number) {
  const t = todayKST();
  const [y, m, d] = t.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function GoalFormDialog({
  open,
  onOpenChange,
  accounts,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: { id: string; name: string; type: AccountType }[];
  initial?: GoalFormValue;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "목표 수정" : "새 목표"}</DialogTitle>
          <DialogDescription>목표 금액과 날짜를 정하면 매달 얼마가 필요한지 계산해 드려요.</DialogDescription>
        </DialogHeader>
        {open ? <GoalForm accounts={accounts} initial={initial} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({
  accounts,
  initial,
  onDone,
}: {
  accounts: { id: string; name: string; type: AccountType }[];
  initial?: GoalFormValue;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : "");
  const [isReal, setIsReal] = useState(initial?.targetIsReal ?? true);
  const [date, setDate] = useState(initial?.targetDate ?? yearsFromToday(5));
  const presetMatch = PRESETS.find((p) => Math.abs(p.rate - (initial?.expectedReturn ?? PRESETS[2].rate)) < 1e-9);
  const [rateMode, setRateMode] = useState(presetMatch ? String(presetMatch.rate) : "custom");
  const [customRate, setCustomRate] = useState(String(((initial?.expectedReturn ?? 0.05) * 100).toFixed(1)));
  const [linked, setLinked] = useState<string[]>(initial?.linkedAccountIds ?? []);
  const [commit, setCommit] = useState(initial?.monthlyCommit ? String(initial.monthlyCommit) : "");
  const [error, setError] = useState<string | null>(null);

  const expectedReturn = rateMode === "custom" ? Number(customRate) / 100 : Number(rateMode);
  const assetAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD" && a.type !== "LOAN");

  function submit() {
    setError(null);
    if (!Number.isFinite(expectedReturn)) return setError("기대수익률을 확인하세요.");
    const payload = {
      name,
      targetAmount: target,
      targetIsReal: isReal,
      targetDate: date,
      expectedReturn,
      linkedAccountIds: linked,
      monthlyCommit: commit || null,
    };
    start(async () => {
      const r = initial?.id ? await updateGoal(initial.id, payload) : await createGoal(payload);
      if (!r.ok) return setError(r.error);
      toast.success(initial?.id ? "목표를 수정했어요" : "목표를 만들었어요");
      onDone();
      if (!initial?.id && r.data && "id" in r.data) router.push(`/goals/${r.data.id}`);
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="목표 이름" htmlFor="goal-name">
        <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 내 집 마련, 비상금, 은퇴자금" className="h-9" maxLength={30} />
      </Field>
      <Field label="목표 금액" htmlFor="goal-target">
        <AmountInput id="goal-target" value={target} onChange={setTarget} quickAdd={[10_000_000, 100_000_000]} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={isReal} onChange={(e) => setIsReal(e.target.checked)} className="mt-0.5 size-4" />
        <span>
          오늘 돈 가치 기준
          <span className="block text-xs text-muted-foreground">물가상승(연 2.5%)을 반영해 목표 시점 금액을 자동으로 키워요</span>
        </span>
      </label>
      <Field label="목표일" htmlFor="goal-date">
        <Input id="goal-date" type="date" min={addDays(todayKST(), 1)} value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        <div className="flex flex-wrap gap-1.5">
          {[1, 3, 5, 10, 20].map((y) => (
            <button key={y} type="button" onClick={() => setDate(yearsFromToday(y))} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
              {y}년 후
            </button>
          ))}
        </div>
      </Field>
      <Field label="기대수익률 (연)" htmlFor="goal-rate" hint="자산군 모델 배분 기준 참고값이에요. 투자 권유가 아닙니다.">
        <NativeSelect id="goal-rate" value={rateMode} onChange={(e) => setRateMode(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.label} value={String(p.rate)}>
              {p.label} · {(p.rate * 100).toFixed(1)}%
            </option>
          ))}
          <option value="custom">직접 입력</option>
        </NativeSelect>
        {rateMode === "custom" ? (
          <div className="relative">
            <Input type="number" step="0.1" min={-10} max={20} value={customRate} onChange={(e) => setCustomRate(e.target.value)} className="h-9 pr-8" />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        ) : null}
      </Field>
      <Field label="연결 계좌" hint="선택한 계좌 잔액 합계를 진척도로 써요. 없으면 순자산 기준.">
        {assetAccounts.length ? (
          <div className="grid max-h-36 gap-1.5 overflow-y-auto rounded-lg border p-2">
            {assetAccounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={linked.includes(a.id)}
                  onChange={(e) => setLinked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((id) => id !== a.id)))}
                />
                {a.name}
                <span className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">등록된 자산 계좌가 없어요.</p>
        )}
      </Field>
      <Field label="월 납입 확정액 (선택)" htmlFor="goal-commit" hint="비워두면 저축 가능액을 우선순위대로 자동 배분해요.">
        <AmountInput id="goal-commit" value={commit} onChange={setCommit} />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewGoalButton({ accounts }: { accounts: { id: string; name: string; type: AccountType }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>새 목표</Button>
      <GoalFormDialog open={open} onOpenChange={setOpen} accounts={accounts} />
    </>
  );
}
