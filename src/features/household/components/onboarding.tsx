"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Heart, Plus, User, Users, X } from "lucide-react";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCompactKRW } from "@/lib/finance/money";
import { formatMonthLabel, lastDayOfMonth, monthsBetween, parseMonthKey, shiftMonth, toDateStr } from "@/lib/finance/period";
import { calculateMonthsToGoal, calculateRequiredInvestment } from "@/lib/finance/projection";
import { completeOnboarding, joinHousehold } from "../actions";
import {
  ASSET_KINDS,
  FIXED_CATEGORIES,
  GOAL_TEMPLATE_KEYS,
  GOAL_TEMPLATES,
  type AssetKind,
  type GoalTemplate,
  type OnboardingInput,
} from "../onboarding-schema";

/** 가입 → 5단계 → 홈 (PROD.MD §1-7). 입력값은 sessionStorage 에만 두고 마지막 단계에서 한 번에 저장한다. */

type Mode = "couple" | "solo" | "join";
type FixedRow = { name: string; category: (typeof FIXED_CATEGORIES)[number]; amount: string; day: number };
type IncomeRow = { name: string; amount: string; day: number };

interface Draft {
  step: number;
  mode: Mode;
  householdName: string;
  code: string;
  template: GoalTemplate;
  goalName: string;
  goalAmount: string;
  goalMonth: string;
  assets: Record<AssetKind, { balance: string; linked: boolean }>;
  loan: string;
  incomes: IncomeRow[];
  fixed: FixedRow[];
  startOnPayday: boolean;
}

const STORAGE_KEY = "finlog:onboarding";
const STEPS = 5;

function initialDraft(userName: string, thisMonth: string): Draft {
  const tpl = GOAL_TEMPLATES.HOME;
  return {
    step: 1,
    mode: "couple",
    householdName: `${userName}네`,
    code: "",
    template: "HOME",
    goalName: tpl.name,
    goalAmount: tpl.amount,
    goalMonth: shiftMonth(thisMonth, tpl.years * 12),
    assets: {
      checking: { balance: "", linked: false },
      savings: { balance: "", linked: true },
      investment: { balance: "", linked: true },
    },
    loan: "",
    incomes: [{ name: "내 월급", amount: "", day: 25 }],
    fixed: [
      { name: "월세·관리비", category: "관리비", amount: "", day: 5 },
      { name: "통신·구독", category: "휴대폰", amount: "", day: 10 },
      { name: "보험", category: "보험", amount: "", day: 15 },
    ],
    startOnPayday: false,
  };
}

const won = (v: string) => (v ? BigInt(v) : 0n);

export function Onboarding({ userName, today }: { userName: string; today: string }) {
  const thisMonth = today.slice(0, 7);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(userName, thisMonth));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 새로고침해도 입력값 유지 (저장소를 못 쓰는 환경이면 그냥 넘어간다)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setDraft({ ...initialDraft(userName, thisMonth), ...JSON.parse(saved) });
    } catch {}
  }, [userName, thisMonth]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft]);

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const go = (step: number) => {
    set({ step });
    window.scrollTo({ top: 0 });
  };

  const payday = draft.incomes[0]?.day ?? 1;
  const paydayStart = payday >= 2 && payday <= 28 ? payday : null;

  const payload = useMemo<OnboardingInput>(
    () => ({
      householdName: draft.householdName,
      goal: { template: draft.template, name: draft.goalName, targetAmount: draft.goalAmount, targetMonth: draft.goalMonth },
      assets: ASSET_KINDS.filter((k) => draft.assets[k.key].balance !== "").map((k) => ({ kind: k.key, ...draft.assets[k.key] })),
      loan: draft.loan,
      incomes: draft.incomes.filter((i) => i.amount !== ""),
      fixed: draft.fixed.filter((f) => f.amount !== ""),
      monthStartDay: draft.startOnPayday && paydayStart ? paydayStart : 1,
    }),
    [draft, paydayStart],
  );

  function stepError(): string | null {
    switch (draft.step) {
      case 1:
        if (draft.mode === "join") return draft.code.length === 6 ? null : "6자리 초대 코드를 입력하세요.";
        return draft.householdName.trim() ? null : "가구 이름을 입력하세요.";
      case 2:
        if (!draft.goalName.trim()) return "목표 이름을 입력하세요.";
        if (won(draft.goalAmount) <= 0n) return "목표 금액을 입력하세요.";
        return draft.goalMonth > thisMonth ? null : "목표 시점은 다음 달 이후로 정하세요.";
      case 3:
        return payload.assets.length ? null : "모아둔 돈을 한 칸 이상 입력하세요. 없으면 0을 넣어 주세요.";
      case 4:
        return payload.incomes.length ? null : "월수입을 입력하세요.";
      default:
        return null;
    }
  }

  function next() {
    const err = stepError();
    if (err) return setError(err);
    if (draft.step === 1 && draft.mode === "join") {
      return start(async () => {
        const r = await joinHousehold({ code: draft.code, dataMode: "fresh" });
        if (r && !r.ok) setError(r.error);
      });
    }
    if (draft.step < STEPS) return go(draft.step + 1);
    start(async () => {
      const r = await completeOnboarding(payload);
      if (r && !r.ok) return setError(r.error);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    });
  }

  const nextLabel = pending
    ? "준비 중…"
    : draft.step === 1 && draft.mode === "join"
      ? "참여하기"
      : draft.step === STEPS
        ? "홈으로"
        : "다음";

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        {draft.step > 1 ? (
          <button type="button" onClick={() => go(draft.step - 1)} className="-ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="이전 단계">
            <ArrowLeft className="size-5" />
          </button>
        ) : null}
        <ol className="flex flex-1 gap-1.5" aria-label={`${STEPS}단계 중 ${draft.step}단계`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} className={cn("h-1 flex-1 rounded-full", i < draft.step ? "bg-foreground" : "bg-muted")} />
          ))}
        </ol>
        <span className="text-xs text-muted-foreground tabular">
          {draft.step} / {STEPS}
        </span>
      </div>

      {draft.step === 1 ? <StepMode draft={draft} set={set} userName={userName} /> : null}
      {draft.step === 2 ? <StepGoal draft={draft} set={set} thisMonth={thisMonth} /> : null}
      {draft.step === 3 ? <StepAssets draft={draft} set={set} /> : null}
      {draft.step === 4 ? <StepCashflow draft={draft} set={set} paydayStart={paydayStart} /> : null}
      {draft.step === 5 ? <StepResult draft={draft} payload={payload} today={today} /> : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Button size="lg" onClick={next} disabled={pending}>
          {nextLabel}
        </Button>
        {draft.step > 1 && draft.step < STEPS ? <p className="text-center text-xs text-muted-foreground">입력한 값은 나중에 언제든 바꿀 수 있어요.</p> : null}
      </div>
    </div>
  );
}

type StepProps = { draft: Draft; set: (patch: Partial<Draft>) => void };

function Title({ children, desc }: { children: React.ReactNode; desc?: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h1 className="text-2xl font-bold text-balance">{children}</h1>
      {desc ? <p className="text-sm text-muted-foreground">{desc}</p> : null}
    </div>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
        selected ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

function StepMode({ draft, set, userName }: StepProps & { userName: string }) {
  const options: { id: Mode; title: string; desc: string; icon: typeof User }[] = [
    { id: "couple", title: "부부로 시작", desc: "가구를 만들고 나중에 배우자를 초대해요", icon: Heart },
    { id: "solo", title: "혼자 시작", desc: "언제든 부부로 바꿀 수 있어요", icon: User },
    { id: "join", title: "초대 코드로 참여", desc: "배우자가 보낸 6자리 코드가 있어요", icon: Users },
  ];
  return (
    <>
      <Title>{userName}님, 누구와 함께 쓰나요?</Title>
      <div className="grid gap-2" role="radiogroup">
        {options.map(({ id, title, desc, icon: Icon }) => (
          <Choice key={id} selected={draft.mode === id} onClick={() => set({ mode: id })}>
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </Choice>
        ))}
      </div>
      {draft.mode === "join" ? (
        <Field label="초대 코드" htmlFor="code" hint="참여하면 배우자가 정한 목표로 바로 시작해요.">
          <Input
            id="code"
            inputMode="numeric"
            maxLength={6}
            value={draft.code}
            onChange={(e) => set({ code: e.target.value.replace(/\D/g, "") })}
            className="h-11 text-center text-xl tracking-[0.4em] tabular"
            placeholder="000000"
          />
        </Field>
      ) : (
        <Field label="가구 이름" htmlFor="hname">
          <Input id="hname" value={draft.householdName} maxLength={30} onChange={(e) => set({ householdName: e.target.value })} className="h-10" />
        </Field>
      )}
    </>
  );
}

function StepGoal({ draft, set, thisMonth }: StepProps & { thisMonth: string }) {
  function pick(template: GoalTemplate) {
    const tpl = GOAL_TEMPLATES[template];
    set({ template, goalName: tpl.name, goalAmount: tpl.amount, goalMonth: shiftMonth(thisMonth, tpl.years * 12) });
  }
  return (
    <>
      <Title desc="목표가 있어야 매달 얼마를 모으고 얼마를 써도 되는지 계산할 수 있어요.">무엇을 위해 모으나요?</Title>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {GOAL_TEMPLATE_KEYS.map((key) => (
          <Choice key={key} selected={draft.template === key} onClick={() => pick(key)}>
            <span className="font-semibold">{GOAL_TEMPLATES[key].label}</span>
          </Choice>
        ))}
      </div>
      {draft.template === "CUSTOM" ? (
        <Field label="목표 이름" htmlFor="gname">
          <Input id="gname" value={draft.goalName} maxLength={30} placeholder="예: 차 바꾸기" onChange={(e) => set({ goalName: e.target.value })} className="h-10" />
        </Field>
      ) : null}
      <Field label="목표 금액" htmlFor="gamount" hint="오늘 돈 가치 기준이에요. 물가 상승분은 자동으로 반영해요.">
        <AmountInput id="gamount" value={draft.goalAmount} onChange={(v) => set({ goalAmount: v })} />
      </Field>
      <Field label="언제까지" htmlFor="gmonth">
        <Input id="gmonth" type="month" min={shiftMonth(thisMonth, 1)} value={draft.goalMonth} onChange={(e) => set({ goalMonth: e.target.value })} className="h-10" />
      </Field>
    </>
  );
}

function StepAssets({ draft, set }: StepProps) {
  const setAsset = (key: AssetKind, patch: Partial<Draft["assets"][AssetKind]>) =>
    set({ assets: { ...draft.assets, [key]: { ...draft.assets[key], ...patch } } });
  const linkedTotal = ASSET_KINDS.reduce((s, k) => (draft.assets[k.key].linked ? s + won(draft.assets[k.key].balance) : s), 0n);
  return (
    <>
      <Title desc="대략적인 금액이면 충분해요. 계좌 이름과 은행은 자산 탭에서 나중에 정리할 수 있어요.">지금 모아둔 돈은 얼마인가요?</Title>
      <div className="grid gap-4">
        {ASSET_KINDS.map((k) => (
          <div key={k.key} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`asset-${k.key}`} className="text-sm font-medium">
                {k.label}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" className="size-3.5" checked={draft.assets[k.key].linked} onChange={(e) => setAsset(k.key, { linked: e.target.checked })} />
                목표에 포함
              </label>
            </div>
            <AmountInput id={`asset-${k.key}`} value={draft.assets[k.key].balance} onChange={(v) => setAsset(k.key, { balance: v })} />
          </div>
        ))}
        <Field label="대출 잔액 (있으면)" htmlFor="asset-loan">
          <AmountInput id="asset-loan" value={draft.loan} onChange={(v) => set({ loan: v })} />
        </Field>
      </div>
      <div className="flex items-baseline justify-between rounded-xl bg-muted px-4 py-3">
        <span className="text-sm text-muted-foreground">목표에 쓸 돈</span>
        <span className="text-lg font-bold tabular">{formatCompactKRW(linkedTotal)}</span>
      </div>
    </>
  );
}

function DayInput({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-20 shrink-0">
      <Input
        id={id}
        inputMode="numeric"
        aria-label="날짜"
        value={value}
        onChange={(e) => onChange(Math.min(31, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
        className="h-11 pr-6 text-right tabular"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">일</span>
    </div>
  );
}

function StepCashflow({ draft, set, paydayStart }: StepProps & { paydayStart: number | null }) {
  const setIncome = (i: number, patch: Partial<IncomeRow>) => set({ incomes: draft.incomes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const setFixed = (i: number, patch: Partial<FixedRow>) => set({ fixed: draft.fixed.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <>
      <Title desc="매달 자동으로 기록돼요. 금액을 비워 둔 줄은 저장하지 않아요.">매달 들어오고 나가는 돈</Title>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">월수입 (세후)</h2>
        {draft.incomes.map((r, i) => (
          <div key={i} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Input aria-label="수입 이름" value={r.name} maxLength={20} onChange={(e) => setIncome(i, { name: e.target.value })} className="h-9" />
              {i > 0 ? (
                <button type="button" aria-label="이 줄 삭제" onClick={() => set({ incomes: draft.incomes.filter((_, j) => j !== i) })} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <AmountInput value={r.amount} onChange={(v) => setIncome(i, { amount: v })} />
              </div>
              <DayInput id={`income-day-${i}`} value={r.day} onChange={(day) => setIncome(i, { day })} />
            </div>
          </div>
        ))}
        {draft.mode === "couple" && draft.incomes.length < 2 ? (
          <button type="button" onClick={() => set({ incomes: [...draft.incomes, { name: "배우자 월급", amount: "", day: 25 }] })} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="size-4" /> 배우자 월급 추가
          </button>
        ) : null}
        {paydayStart ? (
          <label className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={draft.startOnPayday} onChange={(e) => set({ startOnPayday: e.target.checked })} />
            <span>
              한 달을 월급날({paydayStart}일)부터 세기
              <span className="block text-xs text-muted-foreground">켜면 {paydayStart}일~다음 달 {paydayStart - 1}일을 한 달로 집계해요.</span>
            </span>
          </label>
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">고정 지출</h2>
        {draft.fixed.map((r, i) => (
          <div key={i} className="grid gap-1.5 border-b pb-3 last:border-b-0">
            <div className="flex items-center gap-2">
              <Input aria-label="지출 이름" value={r.name} maxLength={20} onChange={(e) => setFixed(i, { name: e.target.value })} className="h-9" />
              <div className="w-32 shrink-0">
                <NativeSelect aria-label="카테고리" value={r.category} onChange={(e) => setFixed(i, { category: e.target.value as FixedRow["category"] })}>
                  {FIXED_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <button type="button" aria-label="이 줄 삭제" onClick={() => set({ fixed: draft.fixed.filter((_, j) => j !== i) })} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <AmountInput value={r.amount} onChange={(v) => setFixed(i, { amount: v })} />
              </div>
              <DayInput id={`fixed-day-${i}`} value={r.day} onChange={(day) => setFixed(i, { day })} />
            </div>
          </div>
        ))}
        {draft.fixed.length < 15 ? (
          <button type="button" onClick={() => set({ fixed: [...draft.fixed, { name: "", category: "기타지출", amount: "", day: 1 }] })} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="size-4" /> 항목 추가
          </button>
        ) : null}
      </section>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", strong ? "border-t pt-2 font-bold" : "text-sm")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function StepResult({ draft, payload, today }: { draft: Draft; payload: OnboardingInput; today: string }) {
  const tpl = GOAL_TEMPLATES[draft.template];
  const target = Number(draft.goalAmount || 0);
  const pv = payload.assets.reduce((s, a) => (a.linked ? s + Number(a.balance) : s), 0);
  const { y, m } = parseMonthKey(draft.goalMonth);
  const months = monthsBetween(today, toDateStr(y, m, lastDayOfMonth(y, m)));
  const common = { target, pv, annualReturn: tpl.expectedReturn, targetIsReal: true };
  const required = calculateRequiredInvestment({ ...common, months });
  const income = payload.incomes.reduce((s, r) => s + Number(r.amount), 0);
  const fixed = payload.fixed.reduce((s, r) => s + Number(r.amount), 0);
  const living = income - fixed - required.monthly;
  const later = calculateRequiredInvestment({ ...common, months: months + 6 });
  const allIn = living < 0 ? calculateMonthsToGoal({ ...common, pmt: Math.max(0, income - fixed) }) : null;
  const monthAfter = (n: number) => formatMonthLabel(shiftMonth(today.slice(0, 7), n));

  return (
    <>
      <Title desc={`${formatMonthLabel(draft.goalMonth)}까지 · 연 ${(tpl.expectedReturn * 100).toFixed(0)}% 가정 · 오늘 돈 가치 기준`}>
        {draft.goalName} {formatCompactKRW(target)}, 이렇게 모으면 돼요
      </Title>

      <div className="grid gap-1 rounded-xl bg-muted px-4 py-4">
        <span className="text-sm text-muted-foreground">{required.alreadyAchievable ? "지금 모은 돈만으로" : "매달 모을 돈"}</span>
        <span className="text-3xl font-black tabular">{required.alreadyAchievable ? "달성 가능해요" : formatCompactKRW(required.monthly)}</span>
      </div>

      <div className="grid gap-2 rounded-xl border px-4 py-3">
        <Row label="월수입" value={formatCompactKRW(income)} />
        <Row label="고정 지출" value={`−${formatCompactKRW(fixed)}`} />
        <Row label="목표 저축" value={`−${formatCompactKRW(required.monthly)}`} />
        <Row label="생활비로 쓸 수 있는 돈" value={formatCompactKRW(living)} strong />
      </div>

      {living < 0 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          월수입으로는 목표 저축을 채우기 어려워요.
          {allIn !== null ? ` 남는 돈을 모두 모으면 ${monthAfter(allIn)}에 달성해요.` : " 목표 금액이나 시점을 조정해 보세요."}
        </p>
      ) : !required.alreadyAchievable ? (
        <p className="text-sm text-muted-foreground">
          빠듯하면: {monthAfter(months + 6)}로 6개월 미루면 월 {formatCompactKRW(later.monthly)}
        </p>
      ) : null}
      {draft.mode === "couple" ? <p className="text-xs text-muted-foreground">배우자 초대 코드는 시작한 뒤 설정에서 만들 수 있어요.</p> : null}
    </>
  );
}
