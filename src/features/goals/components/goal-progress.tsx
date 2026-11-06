"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { AmountInput } from "@/components/common/amount-input";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import type { DateStr } from "@/lib/finance/types";
import { setGoalStartAmount } from "../actions";

const GROWTH_COLOR = "color-mix(in oklab, var(--brand) 38%, transparent)";

export interface GoalProgressValue {
  id: string;
  name: string;
  targetAmount: number;
  current: number;
  startAmount: number;
  growth: number;
  /** 기준일 (예전 목표는 만든 날) */
  since: DateStr;
  legacy: boolean;
  /** 지금 기준 잔액 (연결 계좌 합계, 없으면 순자산) */
  basis: number;
  /** "예적금" · "순자산" 처럼 기준 이름 */
  basisLabel: string;
  editable: boolean;
}

/**
 * 목표 상세의 진척 — 모인 돈을 "기준일에 넣은 돈"과 "그 뒤로 늘어난 돈"으로 나눠 보여 주고,
 * 이미 모은 돈만 그 자리에서 고칠 수 있게 한다.
 */
export function GoalProgressDetail({ goal }: { goal: GoalProgressValue }) {
  const [editing, setEditing] = useState(false);
  const legacy = goal.legacy;
  const pct = (v: number) => (goal.targetAmount > 0 ? Math.min(100, Math.max(0, (v / goal.targetAmount) * 100)) : 0);
  // 늘어난 돈이 음수면 막대는 모인 돈 한 덩어리로만
  const startPart = legacy ? goal.current : Math.min(goal.startAmount, goal.current);
  const growthPart = legacy ? 0 : Math.max(0, goal.current - startPart);
  const startPct = pct(startPart);
  const growthPct = Math.min(100 - startPct, pct(growthPart));

  return (
    <div className="grid gap-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(startPct + growthPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.name} 진척률`}
      >
        <div style={{ width: `${startPct}%`, background: "var(--brand)" }} />
        <div style={{ width: `${growthPct}%`, background: GROWTH_COLOR }} />
      </div>

      {editing ? (
        <StartAmountEditor goal={goal} onDone={() => setEditing(false)} />
      ) : legacy ? (
        <div className="grid gap-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
          <p>
            {goal.basisLabel} 잔액 전체를 모인 돈으로 세고 있어요. 이미 모은 돈을 정하면 그 뒤로 늘어난 돈만 따로 셀 수 있어요.
          </p>
          {goal.editable ? (
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setEditing(true)}>
              이미 모은 돈 정하기
            </Button>
          ) : null}
        </div>
      ) : (
        <dl className="grid gap-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: "var(--brand)" }} aria-hidden />
            <dt className="text-muted-foreground">이미 모은 돈</dt>
            <dd className="ml-auto flex items-center gap-1 font-medium tabular">
              <Money value={goal.startAmount} compact />
              {goal.editable ? (
                <Button variant="ghost" size="icon-xs" aria-label="이미 모은 돈 고치기" onClick={() => setEditing(true)}>
                  <Pencil />
                </Button>
              ) : null}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: GROWTH_COLOR }} aria-hidden />
            <dt className="text-muted-foreground">{goal.growth < 0 ? "그 뒤로 줄어든 돈" : "그 뒤로 늘어난 돈"}</dt>
            <dd className={goal.growth < 0 ? "ml-auto font-medium text-warning tabular" : "ml-auto font-medium tabular"}>
              <Money value={goal.growth} compact sign />
            </dd>
          </div>
          <p className="text-xs text-muted-foreground">
            {goal.basisLabel} 기준 · {goal.since.replaceAll("-", ".")}부터 셈
          </p>
        </dl>
      )}
    </div>
  );
}

function StartAmountEditor({ goal, onDone }: { goal: GoalProgressValue; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(Math.round(goal.current)));
  const [error, setError] = useState<string | null>(null);
  const max = Math.max(0, Math.round(goal.basis));
  const over = Number(value || 0) > max;

  function save() {
    setError(null);
    start(async () => {
      const r = await setGoalStartAmount(goal.id, value || "0");
      if (!r.ok) return setError(r.error);
      toast.success("이미 모은 돈을 고쳤어요");
      onDone();
    });
  }

  return (
    <form
      className="grid gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="goal-start-inline" className="text-sm font-medium">
        이미 모은 돈
      </label>
      <AmountInput id="goal-start-inline" value={value} onChange={setValue} autoFocus />
      <p className="text-xs text-muted-foreground">
        {goal.basisLabel} 잔액 <Money value={max} compact /> 중 이 목표 몫이에요. 저장하면 오늘부터 다시 세요.
      </p>
      {over ? (
        <p className="text-xs text-warning">
          잔액보다 많아서 <Money value={max} compact />으로 맞춰 저장해요.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}
