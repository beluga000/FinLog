"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCompactKRW } from "@/lib/finance/money";
import { formatMonthLabel } from "@/lib/finance/period";
import { LIFE_EVENT_HINT, LIFE_EVENT_KINDS, LIFE_EVENT_LABEL, monthAfter, type LifeEventInput, type LifeEventKind } from "@/lib/finance/life-events";
import type { DateStr } from "@/lib/finance/types";
import { createLifeEvent, deleteLifeEvent } from "../life-event-actions";

/** "매달 100만 줄어요 · 12개월 · 한 번에 300만" */
export function describeLifeEvent(e: LifeEventInput): string {
  const parts: string[] = [];
  if (e.monthly) parts.push(`매달 ${formatCompactKRW(Math.abs(e.monthly))} ${e.monthly < 0 ? "줄어요" : "늘어요"}${e.months ? ` · ${e.months}개월` : ""}`);
  if (e.oneTime) parts.push(`한 번에 ${formatCompactKRW(e.oneTime)}`);
  return parts.join(" · ");
}

/** 목표 화면: 생활 변화 목록·추가 — 각 목표 "만약에"에 반영된다 */
export function LifeEventsCard({ events, today }: { events: LifeEventInput[]; today: DateStr }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<LifeEventKind>("PARENTAL_LEAVE");
  const [label, setLabel] = useState("");
  const [startMonth, setStartMonth] = useState(monthAfter(today, 1));
  const [direction, setDirection] = useState<"down" | "up">("down");
  const [monthly, setMonthly] = useState("");
  const [months, setMonths] = useState("");
  const [oneTime, setOneTime] = useState("");

  function reset() {
    setKind("PARENTAL_LEAVE");
    setLabel("");
    setStartMonth(monthAfter(today, 1));
    setDirection("down");
    setMonthly("");
    setMonths("");
    setOneTime("");
  }

  function submit() {
    const m = Number(monthly || 0);
    start(async () => {
      const r = await createLifeEvent({
        kind,
        label,
        startMonth,
        monthly: direction === "down" ? -m : m,
        months: months ? Number(months) : null,
        oneTime: Number(oneTime || 0),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("생활 변화를 넣었어요. 목표 '만약에'에 반영돼요.");
      setOpen(false);
      reset();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>생활 변화</CardTitle>
        <CardDescription>출산·휴직·이사처럼 저축이 바뀌는 일을 넣어 두면, 목표마다 &lsquo;만약에&rsquo;에서 달성 시점이 어떻게 바뀌는지 보여 드려요.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus /> 추가
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.label || LIFE_EVENT_LABEL[e.kind]} <span className="font-normal text-muted-foreground">· {formatMonthLabel(e.startMonth)}부터</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{describeLifeEvent(e)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`${e.label || LIFE_EVENT_LABEL[e.kind]} 지우기`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteLifeEvent(e.id);
                      if (!r.ok) toast.error(r.error);
                    })
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">아직 넣은 생활 변화가 없어요.</p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>생활 변화 추가</DialogTitle>
            <DialogDescription>{LIFE_EVENT_HINT[kind] || "매달 저축이 바뀌는 금액이나 한 번에 나가는 돈을 넣어 주세요."}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="종류" htmlFor="le-kind">
                <NativeSelect id="le-kind" value={kind} onChange={(e) => setKind(e.target.value as LifeEventKind)}>
                  {LIFE_EVENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {LIFE_EVENT_LABEL[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="시작 달" htmlFor="le-start">
                <Input id="le-start" type="month" value={startMonth} onChange={(e) => e.target.value && setStartMonth(e.target.value)} className="h-9" />
              </Field>
            </div>
            <Field label="이름 (선택)" htmlFor="le-label">
              <Input id="le-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} placeholder={LIFE_EVENT_LABEL[kind]} className="h-9" />
            </Field>
            <Field label="매달 저축" htmlFor="le-monthly">
              <div className="flex gap-1.5" role="radiogroup" aria-label="늘어요 또는 줄어요">
                {(["down", "up"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={direction === d}
                    onClick={() => setDirection(d)}
                    className={cn("rounded-full border px-3 py-0.5 text-sm", direction === d ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted")}
                  >
                    {d === "down" ? "줄어요" : "늘어요"}
                  </button>
                ))}
              </div>
              <AmountInput id="le-monthly" value={monthly} onChange={setMonthly} quickAdd={[100_000, 500_000]} />
            </Field>
            <Field label="몇 개월 동안" htmlFor="le-months" hint="비워 두면 계속 이어져요">
              <Input id="le-months" type="number" inputMode="numeric" min={1} max={600} value={months} onChange={(e) => setMonths(e.target.value)} className="h-9 w-32" />
            </Field>
            <Field label="시작 달에 한 번 나가는 돈" htmlFor="le-once">
              <AmountInput id="le-once" value={oneTime} onChange={setOneTime} quickAdd={[1_000_000, 10_000_000]} />
            </Field>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                취소
              </Button>
              <Button type="submit" disabled={pending || (!Number(monthly || 0) && !Number(oneTime || 0))}>
                넣기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
