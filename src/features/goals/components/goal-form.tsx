"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GOAL_TEMPLATES, GOAL_TEMPLATE_KEYS, type GoalTemplate } from "@/features/household/onboarding-schema";
import { clampStartAmount } from "@/lib/finance/goals";
import { addDays, monthsBetween, todayKST } from "@/lib/finance/period";
import { MODEL_ALLOCATIONS, portfolioMetrics, RISK_PROFILE_LABEL, RISK_PROFILES } from "@/lib/finance/portfolio";
import { calculateRequiredInvestment } from "@/lib/finance/projection";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import type { AccountType } from "@/lib/finance/types";
import { createGoal, updateGoal } from "../actions";
import type { GoalClaims } from "../queries";

export interface GoalFormValue {
  id?: string;
  name: string;
  targetAmount: number;
  targetIsReal: boolean;
  targetDate: string;
  expectedReturn: number;
  linkedAccountIds: string[];
  monthlyCommit: number | null;
  /** 수정할 때 지금 모인 돈 — 시작 금액 칸을 이 값으로 채운다 */
  current?: number;
}

export interface GoalAccount {
  id: string;
  name: string;
  type: AccountType;
  /** 현재 잔액 (원) — 없으면 잔액을 보여 주지 않는다 */
  balance?: number;
}

/** 위험 성향별 모델 배분 기대수익률 + 무엇에 넣는지 한 줄 */
const RATE_HINT: Record<(typeof RISK_PROFILES)[number], string> = {
  STABLE: "예적금 위주",
  STABLE_SEEKING: "예적금 + 채권",
  NEUTRAL: "주식·채권 반반",
  ACTIVE: "주식 위주",
  AGGRESSIVE: "주식 대부분",
};
const PRESETS = RISK_PROFILES.map((p) => ({
  key: p,
  label: RISK_PROFILE_LABEL[p],
  hint: RATE_HINT[p],
  rate: Math.round(portfolioMetrics(MODEL_ALLOCATIONS[p]).expectedReturn * 1000) / 1000,
}));

const YEAR_CHIPS = [1, 3, 5, 10, 20];

/** 이름 뒤 주격 조사 — 받침 있으면 "이", 없으면 "가" */
function subj(name: string) {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${name}이(가)`;
  return (c - 0xac00) % 28 ? `${name}이` : `${name}가`;
}

function yearsFromToday(years: number) {
  const [y, m, d] = todayKST().split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function durationLabel(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m}개월`;
  return m ? `${y}년 ${m}개월` : `${y}년`;
}

export function GoalFormDialog({
  open,
  onOpenChange,
  accounts,
  netWorth,
  claims,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: GoalAccount[];
  /** 연결 계좌가 없을 때 진척 기준이 되는 순자산 */
  netWorth?: number;
  /** 다른 목표가 계좌·순자산에서 이미 쓰는 돈 */
  claims?: GoalClaims;
  initial?: GoalFormValue;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{initial?.id ? "목표 수정" : "새 목표"}</DialogTitle>
          <DialogDescription>얼마를, 언제까지 모을지 정하면 매달 모을 금액을 바로 계산해요.</DialogDescription>
        </DialogHeader>
        {open ? <GoalForm accounts={accounts} netWorth={netWorth} claims={claims} initial={initial} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** 단계 제목 — 입력을 "무엇을 · 언제까지 · 어떻게" 세 묶음으로 나눈다 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t px-5 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Chip({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-brand bg-brand-soft font-semibold text-brand" : "text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GoalForm({
  accounts,
  netWorth,
  claims,
  initial,
  onDone,
}: {
  accounts: GoalAccount[];
  netWorth?: number;
  claims?: GoalClaims;
  initial?: GoalFormValue;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = todayKST();
  const [template, setTemplate] = useState<GoalTemplate | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : "");
  const [isReal, setIsReal] = useState(initial?.targetIsReal ?? true);
  const [date, setDate] = useState(initial?.targetDate ?? yearsFromToday(5));
  const presetMatch = PRESETS.find((p) => Math.abs(p.rate - (initial?.expectedReturn ?? PRESETS[2].rate)) < 1e-9);
  const [rateMode, setRateMode] = useState(presetMatch ? String(presetMatch.rate) : "custom");
  const [customRate, setCustomRate] = useState(String(((initial?.expectedReturn ?? 0.05) * 100).toFixed(1)));
  const [linked, setLinked] = useState<string[]>(initial?.linkedAccountIds ?? []);
  const [commit, setCommit] = useState(initial?.monthlyCommit ? String(initial.monthlyCommit) : "");
  // 새 목표는 0원부터 — 계좌에 원래 있던 돈을 통째로 목표 진척으로 치지 않는다
  const [startInput, setStartInput] = useState(initial?.id ? String(Math.round(initial.current ?? 0)) : "0");
  const [error, setError] = useState<string | null>(null);

  const expectedReturn = rateMode === "custom" ? Number(customRate) / 100 : Number(rateMode);
  const assetAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD" && a.type !== "LOAN");
  const preset = PRESETS.find((p) => String(p.rate) === rateMode);

  // 미리보기 — 서버(createGoal/updateGoal)와 같은 기준: 연결 계좌 합계, 없으면 순자산 중 시작 금액만큼이 지금 모인 돈
  const linkedAccounts = assetAccounts.filter((a) => linked.includes(a.id));
  const knowsBalance = linkedAccounts.length ? linkedAccounts.every((a) => a.balance !== undefined) : netWorth !== undefined;
  const basis = linkedAccounts.length ? linkedAccounts.reduce((s, a) => s + (a.balance ?? 0), 0) : (netWorth ?? 0);
  const startNum = Number(startInput || 0);
  const current = clampStartAmount(startNum, basis);
  const startOver = knowsBalance && startNum > current;
  // 다른 목표가 이미 쓰는 돈을 뺀 남은 잔액 — 같은 돈이 두 목표에 잡히지 않게
  const othersOn = (accountId: string) => (claims?.byAccount[accountId] ?? []).filter((c) => c.goalId !== initial?.id);
  const remainingOf = (a: GoalAccount) => Math.max(0, (a.balance ?? 0) - othersOn(a.id).reduce((s, c) => s + c.amount, 0));
  const othersAll = (claims?.all ?? []).filter((c) => c.goalId !== initial?.id).reduce((s, c) => s + c.amount, 0);
  const available = linkedAccounts.length
    ? linkedAccounts.reduce((s, a) => s + remainingOf(a), 0)
    : Math.max(0, (netWorth ?? 0) - othersAll);
  const shared = available < Math.max(0, basis);
  const overlap = knowsBalance && shared && current > available;
  const targetNum = Number(target || 0);
  const months = monthsBetween(today, date);
  const ready = targetNum > 0 && months > 0 && Number.isFinite(expectedReturn) && knowsBalance;
  const required = ready
    ? calculateRequiredInvestment({ target: targetNum, pv: current, months, annualReturn: expectedReturn, targetIsReal: isReal })
    : null;
  const commitNum = Number(commit || 0);

  function pickTemplate(key: GoalTemplate) {
    const tpl = GOAL_TEMPLATES[key];
    setTemplate(key);
    setName(tpl.name);
    if (tpl.amount) setTarget(tpl.amount);
    setDate(yearsFromToday(tpl.years));
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError("목표 이름을 적어 주세요.");
    if (!targetNum) return setError("목표 금액을 적어 주세요.");
    if (!Number.isFinite(expectedReturn)) return setError("기대수익률을 확인하세요.");
    const payload = {
      name,
      targetAmount: target,
      targetIsReal: isReal,
      targetDate: date,
      expectedReturn,
      linkedAccountIds: linked,
      monthlyCommit: commit || null,
      startAmount: String(current),
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
      className="grid"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section title="무엇을 모을까요">
        {!initial?.id ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="자주 쓰는 목표">
            {GOAL_TEMPLATE_KEYS.map((key) => (
              <Chip key={key} selected={template === key} onClick={() => pickTemplate(key)}>
                {GOAL_TEMPLATES[key].label}
              </Chip>
            ))}
          </div>
        ) : null}
        <Field label="목표 이름" htmlFor="goal-name">
          <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 내 집 마련, 차 바꾸기" className="h-10" maxLength={30} />
        </Field>
        <Field label="목표 금액" htmlFor="goal-target">
          <AmountInput id="goal-target" value={target} onChange={setTarget} quickAdd={[1_000_000, 10_000_000, 100_000_000]} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={isReal} onChange={(e) => setIsReal(e.target.checked)} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span>오늘 돈 가치로 정하기</span>
            <span className="text-xs text-muted-foreground">
              {isReal && required && required.nominalTarget > targetNum ? (
                <>
                  물가가 연 2.5%씩 오르면 목표일엔 <Money value={required.nominalTarget} compact />이 필요해서, 그만큼 모으도록 계산해요.
                </>
              ) : (
                "물가가 오르는 만큼 목표 시점 금액을 키워서 계산해요."
              )}
            </span>
          </span>
        </label>
      </Section>

      <Section title="언제까지">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="기간">
          {YEAR_CHIPS.map((y) => (
            <Chip key={y} selected={date === yearsFromToday(y)} onClick={() => setDate(yearsFromToday(y))}>
              {y}년 후
            </Chip>
          ))}
        </div>
        <Field label="목표일" htmlFor="goal-date">
          <div className="flex items-center gap-3">
            <Input id="goal-date" type="date" min={addDays(today, 1)} value={date} onChange={(e) => setDate(e.target.value)} className="h-10 flex-1" />
            {months > 0 ? <span className="shrink-0 text-sm text-muted-foreground tabular">{durationLabel(months)} 뒤</span> : null}
          </div>
        </Field>
      </Section>

      <Section title="어떻게 모을까요">
        <Field label="모으는 계좌" hint={linked.length ? "고른 계좌 잔액이 늘어난 만큼 이 목표에 쌓여요." : "고르지 않으면 순자산이 늘어난 만큼 이 목표에 쌓여요."}>
          {assetAccounts.length ? (
            <div className="grid max-h-44 divide-y overflow-y-auto rounded-lg border">
              {assetAccounts.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={linked.includes(a.id)}
                    onChange={(e) => setLinked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((id) => id !== a.id)))}
                  />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">
                      {a.name} <span className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                    </span>
                    <ClaimLine claims={othersOn(a.id)} />
                  </span>
                  {a.balance !== undefined ? (
                    othersOn(a.id).length ? (
                      <span className="grid shrink-0 text-right text-xs leading-tight tabular">
                        <span>
                          남은 <Money value={remainingOf(a)} compact />
                        </span>
                        <span className="text-muted-foreground">
                          / <Money value={a.balance} compact />
                        </span>
                      </span>
                    ) : (
                      <Money value={a.balance} compact className="shrink-0 text-xs text-muted-foreground" />
                    )
                  ) : null}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">등록된 자산 계좌가 없어요. 자산 화면에서 통장·예적금·투자 계좌를 먼저 등록하세요.</p>
          )}
        </Field>

        <Field
          label="이미 모은 돈"
          htmlFor="goal-start"
          hint={
            knowsBalance ? (
              <>
                {linkedAccounts.length ? "고른 계좌" : "순자산"} <Money value={Math.max(0, basis)} compact /> 중 이 목표 몫만 적어요.
                {shared ? (
                  <>
                    {" "}
                    다른 목표 몫을 빼면 <Money value={available} compact /> 남아요.
                  </>
                ) : (
                  " 다른 데 쓸 돈이면 0원으로 두세요."
                )}
              </>
            ) : (
              "기존 잔액 중 이 목표 몫만 적어요."
            )
          }
        >
          <AmountInput id="goal-start" value={startInput} onChange={setStartInput} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="이미 모은 돈 빠른 선택">
            <Chip selected={startNum === 0} onClick={() => setStartInput("0")}>
              0원부터
            </Chip>
            {knowsBalance && available > 0 ? (
              <Chip selected={startNum > 0 && startNum === Math.round(available)} onClick={() => setStartInput(String(Math.round(available)))}>
                {shared ? "남은 잔액 전부" : "잔액 전부"} (<Money value={available} compact />)
              </Chip>
            ) : null}
          </div>
          {startOver ? (
            <p className="text-xs text-warning">
              잔액보다 많아서 <Money value={current} compact />으로 맞춰 저장해요.
            </p>
          ) : overlap ? (
            <p className="text-xs text-warning">다른 목표 몫과 겹쳐요. 겹친 만큼은 같은 돈이 두 목표에 함께 잡혀요.</p>
          ) : null}
        </Field>

        <Field label="기대수익률 (연)" hint={`${preset ? `${preset.hint} 배분 기준이에요. ` : ""}참고용 계산이며 투자 권유가 아니에요.`}>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="기대수익률">
            {PRESETS.map((p) => (
              <Chip key={p.key} selected={rateMode === String(p.rate)} onClick={() => setRateMode(String(p.rate))} className="grid rounded-lg px-2 py-1.5">
                <span>{p.label}</span>
                <span className="tabular">{(p.rate * 100).toFixed(1)}%</span>
              </Chip>
            ))}
            <Chip selected={rateMode === "custom"} onClick={() => setRateMode("custom")} className="grid rounded-lg px-2 py-1.5">
              <span>직접 입력</span>
              <span className="tabular">{rateMode === "custom" ? `${customRate || 0}%` : "—"}</span>
            </Chip>
          </div>
          {rateMode === "custom" ? (
            <div className="relative">
              <Input
                aria-label="기대수익률 직접 입력"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={-10}
                max={20}
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                className="h-10 pr-8"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          ) : null}
        </Field>

        <Field label="매달 넣을 금액 (선택)" htmlFor="goal-commit" hint="비워 두면 매달 저축할 수 있는 돈을 우선순위 순으로 나눠 넣어요.">
          <AmountInput id="goal-commit" value={commit} onChange={setCommit} />
          {required && !required.alreadyAchievable && !commit ? (
            <button
              type="button"
              onClick={() => setCommit(String(required.monthly))}
              className="justify-self-start text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              필요한 금액(<Money value={required.monthly} />)에 맞추기
            </button>
          ) : null}
        </Field>
      </Section>

      {/* 계산 결과 — 스크롤해도 저장 버튼과 함께 보인다 */}
      <div className="sticky bottom-0 grid gap-3 border-t bg-popover px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <GoalPreview current={current} months={months} required={required} commit={commitNum} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "저장 중…" : initial?.id ? "저장" : "목표 만들기"}
        </Button>
      </div>
    </form>
  );
}

function GoalPreview({
  current,
  months,
  required,
  commit,
}: {
  current: number;
  months: number;
  required: ReturnType<typeof calculateRequiredInvestment> | null;
  commit: number;
}) {
  if (!required) {
    return <p className="text-sm text-muted-foreground">목표 금액과 목표일을 정하면 매달 모을 금액이 여기 나와요.</p>;
  }
  if (required.alreadyAchievable) {
    return (
      <div className="grid gap-0.5">
        <p className="text-sm font-semibold text-brand">지금 모인 돈만 굴려도 목표일까지 닿아요</p>
        <p className="text-xs text-muted-foreground">
          이미 모은 돈 <Money value={current} compact /> 기준
        </p>
      </div>
    );
  }
  const short = commit > 0 && commit < required.monthly;
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">
        {durationLabel(months)} 동안 매달
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <Money value={required.monthly} className="text-2xl font-bold tabular" />
        <span className="text-sm text-muted-foreground">모으면 돼요</span>
      </p>
      <p className="text-xs text-muted-foreground">
        이미 모은 돈 <Money value={current} compact /> 기준
        {commit > 0 ? (
          short ? (
            <span className="text-warning">
              {" "}
              · 매달 <Money value={commit} compact />이면 <Money value={required.monthly - commit} compact /> 모자라요
            </span>
          ) : (
            <span className="text-brand"> · 매달 넣을 금액으로 충분해요</span>
          )
        ) : null}
      </p>
    </div>
  );
}

/** 계좌 아래 한 줄 — 다른 목표가 이 계좌에서 쓰는 돈 */
function ClaimLine({ claims }: { claims: { name: string; amount: number }[] }) {
  if (!claims.length) return null;
  const total = claims.reduce((s, c) => s + c.amount, 0);
  const who = claims.length === 1 ? subj(claims[0].name) : `${claims[0].name} 외 ${claims.length - 1}개 목표가`;
  return (
    <span className="truncate text-xs text-warning">
      {who} <Money value={total} compact /> 쓰는 중
    </span>
  );
}

export function NewGoalButton({ accounts, netWorth, claims }: { accounts: GoalAccount[]; netWorth?: number; claims?: GoalClaims }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>새 목표</Button>
      <GoalFormDialog open={open} onOpenChange={setOpen} accounts={accounts} netWorth={netWorth} claims={claims} />
    </>
  );
}
