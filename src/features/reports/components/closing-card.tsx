import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/finance/money";
import { parseMonthKey } from "@/lib/finance/period";
import type { ClosingPace } from "@/lib/finance/closing";
import type { MonthlyClosing } from "../closing";
import { StartChallengeButton } from "./challenge-controls";

const PACE_TONE: Record<ClosingPace["tone"], string> = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
};

/** 증감 — 돈이 더 남는 쪽(good)이면 초록, 덜 남는 쪽이면 주황 */
function Diff({ value, good }: { value: bigint; good: boolean }) {
  if (value === 0n) return <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">그대로</span>;
  return (
    <span className={cn("w-16 shrink-0 text-right text-xs font-medium", good ? "text-good" : "text-warning")}>
      {value > 0n ? "+" : "−"}
      <Money value={value > 0n ? value : -value} compact />
    </span>
  );
}

/** "왜 넘겼는지 보기" — 쓸 수 있는 돈 계산식 줄마다 전월 대비, 그 아래 늘거나 준 지출 카테고리 */
function SpendableBreakdown({ closing: c }: { closing: MonthlyClosing }) {
  const { now, prev } = c.breakdown;
  const lines: { label: string; value: bigint; prev: bigint | null; minus: boolean }[] = [
    { label: "수입", value: now.income, prev: prev?.income ?? null, minus: false },
    { label: "고정 지출", value: now.fixed, prev: prev?.fixed ?? null, minus: true },
    { label: "저축 계획", value: now.plannedSaving, prev: prev?.plannedSaving ?? null, minus: true },
    { label: "생활비", value: now.variable, prev: prev?.variable ?? null, minus: true },
  ];
  const over = c.spendableResult < 0n;
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-muted/50 p-2">
      <dl className="grid gap-0.5">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline gap-2 px-1.5 py-0.5">
            <dt className="min-w-0 flex-1 text-muted-foreground">
              {l.minus ? "− " : ""}
              {l.label}
            </dt>
            <dd className="shrink-0 font-medium">
              <Money value={l.value} compact />
            </dd>
            {l.prev !== null ? <Diff value={l.value - l.prev} good={l.minus ? l.value < l.prev : l.value > l.prev} /> : null}
          </div>
        ))}
        <div className="flex items-baseline gap-2 border-t px-1.5 pt-1">
          <dt className="min-w-0 flex-1 font-medium">= {over ? "넘긴 돈" : "남긴 돈"}</dt>
          <dd className={cn("shrink-0 font-semibold", over && "text-critical")}>
            <Money value={over ? -c.spendableResult : c.spendableResult} compact />
          </dd>
          {prev !== null ? <span className="w-16 shrink-0" /> : null}
        </div>
      </dl>
      {c.drivers.length ? (
        <div className="grid gap-0.5 border-t pt-2">
          <p className="px-1.5 text-xs text-muted-foreground">
            {c.drivers.some((d) => d.diff !== null) ? (over ? "지출이 많이 늘어난 곳" : "지출을 많이 줄인 곳") : "많이 쓴 곳"}
          </p>
          <ul>
            {c.drivers.map((d) => (
              <li key={`${d.kind}:${d.name}`}>
                <Link href={c.ledgerHref} className="flex items-baseline gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">
                    {d.kind === "oneOff" ? <span className="mr-1 text-xs text-muted-foreground">큰 지출 한 건</span> : null}
                    {d.name}
                  </span>
                  <Money value={d.amount} compact className="shrink-0 text-xs text-muted-foreground" />
                  {d.diff !== null ? <Diff value={d.diff} good={d.diff < 0n} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {prev !== null ? <p className="px-1.5 text-xs text-muted-foreground">오른쪽 숫자는 전월보다 늘거나 준 금액이에요.</p> : null}
    </div>
  );
}

/** 리포트 최상단 — 지난달 결산 + 다음 달 조정 제안 (§4-7, AC-16) */
export function ClosingCard({ closing: c, surplusAction }: { closing: MonthlyClosing; surplusAction?: React.ReactNode }) {
  const { m } = parseMonthKey(c.month);
  const over = c.spendableResult < 0n;
  const savingRatio = c.saving.planned > 0n ? Number(c.saving.actual) / Number(c.saving.planned) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m}월 결산</CardTitle>
        <CardDescription>지난달을 돌아보고 이번 달을 조정해요.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-4">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">쓸 수 있는 돈</dt>
            <dd className={cn("font-semibold", over && "text-critical")}>
              <Money value={over ? -c.spendableResult : c.spendableResult} compact /> {over ? "초과" : "남김"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">목표 저축</dt>
            <dd className="font-semibold">
              <Money value={c.saving.actual} compact />
              {c.saving.planned > 0n ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  / <Money value={c.saving.planned} compact />
                </span>
              ) : null}
            </dd>
            {savingRatio !== null ? (
              <dd className={cn("text-xs", savingRatio >= 1 ? "text-good" : "text-warning")}>
                {savingRatio >= 1 ? "달성" : `${formatPercent(savingRatio, 0)} 달성`}
              </dd>
            ) : null}
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">저축률</dt>
            <dd className="font-semibold tabular">{formatPercent(c.savingsRate, 0)}</dd>
          </div>
          {c.primaryGoal ? (
            <div className="grid gap-0.5">
              <dt className="truncate text-xs text-muted-foreground">{c.primaryGoal.name}</dt>
              {c.primaryGoal.pace ? (
                <>
                  <dd className={cn("font-semibold", PACE_TONE[c.primaryGoal.pace.tone])}>{c.primaryGoal.pace.text}</dd>
                  {c.primaryGoal.pace.change ? <dd className="text-xs text-muted-foreground">{c.primaryGoal.pace.change}</dd> : null}
                </>
              ) : (
                <dd className="font-semibold">잔액 기록 이전</dd>
              )}
            </div>
          ) : null}
        </dl>

        <details className="-mt-1 text-sm">
          <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            {over ? "왜 넘겼는지" : "어떻게 남겼는지"} 보기
          </summary>
          <SpendableBreakdown closing={c} />
        </details>

        {c.challengeResults.length ? (
          <ul className="grid gap-1 border-t pt-3 text-sm">
            {c.challengeResults.map((r) => (
              <li key={r.text} className={cn("flex items-start gap-1.5", r.tone === "good" && "text-good")}>
                <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {r.text}
              </li>
            ))}
          </ul>
        ) : null}

        {c.suggestions.length ? (
          <div className="grid gap-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">이번 달 조정 제안</div>
            <ul className="grid gap-1.5">
              {c.suggestions.map((s) => (
                <li key={s.kind} className="grid gap-1.5">
                  <Link href={s.href} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/70">
                    <span className="min-w-0 flex-1">{s.text}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                  {/* 남은 돈 제안은 읽고 끝나지 않게 바로 옮기기 기록으로 */}
                  {s.kind === "surplus" && surplusAction ? <div className="flex flex-wrap gap-2 pl-1">{surplusAction}</div> : null}
                  {/* 사용처 집중 제안은 이번 달 챌린지로 */}
                  {s.kind === "merchant" && c.challenge ? (
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      {c.challenge.started ? (
                        <span className="text-xs text-muted-foreground">이번 달 {c.challenge.limitCount}번까지 해 보는 중이에요 · 홈에서 진행을 볼 수 있어요</span>
                      ) : (
                        <StartChallengeButton merchant={c.challenge.merchant} count={c.challenge.count} amount={c.challenge.amount} limitCount={c.challenge.limitCount} />
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-t pt-3 text-sm text-muted-foreground">지난달은 계획대로 갔어요. 이번 달도 같은 페이스로 가면 돼요.</p>
        )}
      </CardContent>
    </Card>
  );
}
