"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { evaluateGoal } from "@/lib/finance/goals";
import { MODEL_ALLOCATIONS, portfolioMetrics, RISK_PROFILE_LABEL, RISK_PROFILES } from "@/lib/finance/portfolio";
import { formatMonthLabel, lastDayOfMonth, toDateStr } from "@/lib/finance/period";
import { inflate, toMonthlyRate } from "@/lib/finance/projection";
import type { DateStr } from "@/lib/finance/types";
import { applyGoalPlan } from "../actions";
import { GoalProjectionChart, type GoalChartPoint } from "./goal-chart";

const INFLATION = 0.025;

const PRESETS = RISK_PROFILES.map((p) => ({
  key: p,
  label: RISK_PROFILE_LABEL[p],
  rate: Math.round(portfolioMetrics(MODEL_ALLOCATIONS[p]).expectedReturn * 1000) / 10,
}));

function addMonths(date: DateStr, months: number): DateStr {
  const [y, m, d] = date.split("-").map(Number);
  return toDateStr(y, m + months, Math.min(d, 28));
}

function etaLabel(today: DateStr, months: number) {
  return formatMonthLabel(addMonths(today, months).slice(0, 7));
}

function evaluatePlan(goal: WhatIfGoal, today: DateStr, contribution: number, annualReturn: number, targetDate: DateStr) {
  return evaluateGoal({
    target: goal.targetAmount,
    targetIsReal: goal.targetIsReal,
    targetDate,
    expectedReturn: annualReturn,
    current: goal.current,
    monthlyContribution: contribution,
    today,
    inflation: INFLATION,
  });
}

export interface WhatIfGoal {
  id: string;
  targetAmount: number;
  targetIsReal: boolean;
  targetDate: DateStr;
  expectedReturn: number;
  current: number;
  /** 지금 계획의 월 납입액 (확정값 또는 자동 배분) */
  contribution: number;
  editable: boolean;
}

/**
 * "만약에" 패널 (§4-1, AC-15) — 월 저축·수익률·목표일을 바꾸면 서버 왕복 없이 달성 시점과 경로를 다시 계산한다.
 * "이 계획으로 바꾸기"만 서버에 저장한다.
 */
export function GoalWhatIf({ goal, today }: { goal: WhatIfGoal; today: DateStr }) {
  const [pending, start] = useTransition();
  const [monthly, setMonthly] = useState(String(Math.max(0, Math.round(goal.contribution))));
  const [rate, setRate] = useState(Math.round(goal.expectedReturn * 1000) / 10);
  const [targetMonth, setTargetMonth] = useState(goal.targetDate.slice(0, 7));

  // 목표 월을 바꾸지 않았으면 기존 목표일 그대로, 바꿨으면 그 달 말일
  const targetDate = useMemo(() => {
    if (targetMonth === goal.targetDate.slice(0, 7)) return goal.targetDate;
    const [y, m] = targetMonth.split("-").map(Number);
    return toDateStr(y, m, lastDayOfMonth(y, m));
  }, [targetMonth, goal.targetDate]);

  const pmt = Number(monthly || 0);
  const base = useMemo(() => evaluatePlan(goal, today, goal.contribution, goal.expectedReturn, goal.targetDate), [goal, today]);
  const plan = useMemo(() => evaluatePlan(goal, today, pmt, rate / 100, targetDate), [goal, today, pmt, rate, targetDate]);

  const data = useMemo(() => {
    const r = toMonthlyRate(rate / 100);
    const horizon = Math.min(480, Math.max(plan.monthsLeft, plan.projectedMonths ?? plan.monthsLeft, 12));
    const step = Math.max(1, Math.ceil(horizon / 60));
    const showRequired = !plan.onTrack && !plan.required.alreadyAchievable;
    const points: GoalChartPoint[] = [];
    let projected = goal.current;
    let required = goal.current;
    for (let m = 0; m <= horizon; m++) {
      if (m > 0) {
        projected = projected * (1 + r) + pmt;
        required = required * (1 + r) + plan.required.monthly;
      }
      if (m % step === 0 || m === horizon || m === plan.monthsLeft) {
        const [y, mo] = addMonths(today, m).split("-");
        points.push({
          label: `${y.slice(2)}.${mo}`,
          projected: Math.round(projected),
          required: showRequired && m <= plan.monthsLeft ? Math.round(required) : null,
          target: Math.round(goal.targetIsReal ? inflate(goal.targetAmount, m, INFLATION) : goal.targetAmount),
        });
      }
    }
    return { points, showRequired };
  }, [plan, pmt, rate, goal, today]);

  const changed =
    pmt !== Math.round(goal.contribution) || Math.abs(rate / 100 - goal.expectedReturn) > 1e-9 || targetDate !== goal.targetDate;
  // 지금 계획 대비 달성 시점 변화 (양수 = 빨라짐)
  const shift =
    base.projectedMonths !== null && plan.projectedMonths !== null ? base.projectedMonths - plan.projectedMonths : null;

  function apply() {
    start(async () => {
      const r = await applyGoalPlan(goal.id, { monthlyCommit: String(pmt), expectedReturn: rate / 100, targetDate });
      if (!r.ok) return void toast.error(r.error);
      toast.success("계획을 바꿨어요. 홈의 목표 저축에도 반영돼요.");
    });
  }

  return (
    <Card id="what-if" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>만약에</CardTitle>
        <CardDescription>값을 바꾸면 바로 다시 계산해요. 저장은 &lsquo;이 계획으로 바꾸기&rsquo;를 눌렀을 때만 해요.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-5">
          <Field label="매달 저축" htmlFor="wi-pmt" hint={`지금 계획: 월 ${Math.round(goal.contribution).toLocaleString("ko-KR")}원`}>
            <AmountInput id="wi-pmt" value={monthly} onChange={setMonthly} quickAdd={[100_000, 500_000]} />
          </Field>
          <Field label="기대수익률 (연)" htmlFor="wi-rate">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setRate(p.rate)}
                  aria-pressed={rate === p.rate}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    rate === p.rate ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p.label} {p.rate}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                id="wi-rate"
                type="range"
                min={-5}
                max={15}
                step={0.1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--brand)]"
              />
              <span className="w-14 text-right text-sm font-semibold tabular">{rate}%</span>
            </div>
          </Field>
          <Field label="목표 시점" htmlFor="wi-date">
            <Input
              id="wi-date"
              type="month"
              min={addMonths(today, 1).slice(0, 7)}
              value={targetMonth}
              onChange={(e) => e.target.value && setTargetMonth(e.target.value)}
              className="h-9"
            />
          </Field>
        </div>

        <div className="grid content-start gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">예상 달성</dt>
              <dd className="font-semibold">
                {plan.required.alreadyAchievable
                  ? "지금 자산으로 충분"
                  : plan.projectedMonths === null
                    ? "달성이 어려워요"
                    : etaLabel(today, plan.projectedMonths)}
              </dd>
              {shift !== null && shift !== 0 && changed ? (
                <dd className={cn("text-xs", shift > 0 ? "text-good" : "text-critical")}>
                  지금 계획보다 {Math.abs(shift)}개월 {shift > 0 ? "빨라요" : "늦어요"}
                </dd>
              ) : null}
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">목표 시점 대비</dt>
              <dd
                className={cn(
                  "font-semibold",
                  plan.aheadMonths === null || plan.aheadMonths < 0 ? "text-critical" : "text-good",
                )}
              >
                {plan.required.alreadyAchievable
                  ? "달성 가능"
                  : plan.aheadMonths === null
                    ? "100년 안에 어려워요"
                    : plan.aheadMonths >= 0
                      ? `${plan.aheadMonths}개월 앞섬`
                      : `${-plan.aheadMonths}개월 늦음`}
              </dd>
            </div>
            <div className="col-span-2 grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{formatMonthLabel(targetMonth)}에 맞추려면</dt>
              <dd className="font-semibold">
                {plan.required.alreadyAchievable ? (
                  "추가 납입 없이 달성"
                ) : (
                  <>
                    월 <Money value={plan.required.monthly} />
                  </>
                )}
              </dd>
            </div>
          </dl>

          <GoalProjectionChart data={data.points} showRequired={data.showRequired} />

          {goal.editable ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {changed ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMonthly(String(Math.max(0, Math.round(goal.contribution))));
                    setRate(Math.round(goal.expectedReturn * 1000) / 10);
                    setTargetMonth(goal.targetDate.slice(0, 7));
                  }}
                >
                  되돌리기
                </Button>
              ) : null}
              <Button type="button" size="lg" disabled={!changed || pending} onClick={apply}>
                {pending ? "저장 중…" : "이 계획으로 바꾸기"}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
