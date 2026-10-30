import Link from "next/link";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalPace, GoalProgressBar } from "@/features/goals/components/goal-status";
import type { GoalView } from "@/features/goals/queries";
import { formatPercent } from "@/lib/finance/money";
import { formatMonthLabel, getMonthKey, shiftMonth } from "@/lib/finance/period";
import type { Spendable } from "@/lib/finance/spendable";
import type { DateStr } from "@/lib/finance/types";

/** 주의 기준: 생활비의 80% 이상 사용 (PROD.MD §5.4) */
const CAUTION_RATIO = 0.8;

function Bar({ ratio, tone, label }: { ratio: number; tone: "good" | "warning" | "critical" | "accent"; label: string }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div
      className="h-2 rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "h-2 rounded-full",
          tone === "good" && "bg-good",
          tone === "warning" && "bg-warning",
          tone === "critical" && "bg-critical",
        )}
        style={{ width: `${pct}%`, ...(tone === "accent" ? { background: "var(--brand)" } : {}) }}
      />
    </div>
  );
}

/** ① 대표 목표 — priority 1위 ACTIVE 목표 + 나머지 한 줄 요약 */
export function PrimaryGoalCard({ goals, today }: { goals: GoalView[]; today: DateStr }) {
  const active = goals.filter((g) => g.status === "ACTIVE");
  const [primary, ...others] = active;
  if (!primary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>첫 목표 정하기</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <p>목표를 정하면 매달 얼마를 모으고 얼마를 써도 되는지 계산해 드려요.</p>
          <Link href="/goals" className="font-medium text-foreground underline">
            목표 만들기
          </Link>
        </CardContent>
      </Card>
    );
  }
  const e = primary.evaluation;
  const eta =
    e.projectedMonths !== null && !e.required.alreadyAchievable
      ? formatMonthLabel(shiftMonth(getMonthKey(today, 1), e.projectedMonths))
      : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{primary.name}</CardTitle>
        <CardAction>
          <Link href={`/goals/${primary.id}`} className="text-xs text-muted-foreground hover:underline">
            자세히
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Money value={primary.current} className="text-2xl font-bold" />
          <span className="text-sm text-muted-foreground">
            / <Money value={primary.targetAmount} compact />
          </span>
          <span className="ml-auto text-sm font-semibold tabular">{formatPercent(e.progress, 0)}</span>
        </div>
        <GoalProgressBar goal={primary} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
            <GoalPace goal={primary} />
          </span>
          {eta ? <span className="text-xs text-muted-foreground">예상 달성 {eta}</span> : null}
        </div>
        {others.length ? (
          <ul className="grid gap-1.5 border-t pt-3">
            {others.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.id}`} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">
                    {formatPercent(g.evaluation.progress, 0)} · <GoalPace goal={g} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** ② 쓸 수 있는 돈 (§2-7) */
export function SpendableCard({ spendable: s, hasIncome }: { spendable: Spendable; hasIncome: boolean }) {
  if (!hasIncome) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>쓸 수 있는 돈</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <p>월급을 정기 거래로 등록하면 이번 달 쓸 수 있는 돈을 계산해 드려요.</p>
          <Link href="/ledger/recurring" className="font-medium text-foreground underline">
            월급 등록하기
          </Link>
        </CardContent>
      </Card>
    );
  }
  const ratio = s.usedRatio ?? (s.variableExpense > 0n ? 1 : 0);
  const tone = s.overspent ? "critical" : ratio >= CAUTION_RATIO ? "warning" : "accent";
  return (
    <Card>
      <CardHeader>
        <CardTitle>이번 달 쓸 수 있는 돈</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {s.overspent ? (
            <>
              <Money value={-s.remaining} className="text-2xl font-bold text-critical" />
              <span className="text-sm font-medium text-critical">초과</span>
            </>
          ) : (
            <Money value={s.remaining} className="text-2xl font-bold" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          남은 {s.daysLeft}일 · 하루 <Money value={s.daily} className="font-semibold text-foreground" />
        </p>
        <div className="grid gap-1">
          <Bar ratio={ratio} tone={tone} label="생활비 사용 비율" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              생활비 <Money value={s.variableExpense} compact /> 사용
            </span>
            <span>
              {s.livingBudget > 0n ? (
                <>
                  <Money value={s.livingBudget} compact /> 중 {formatPercent(ratio, 0)}
                </>
              ) : (
                <span className="text-critical">고정비·저축이 수입보다 많아요</span>
              )}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-xs sm:grid-cols-4">
          {(
            [
              ["수입", s.income],
              ["고정비", s.fixed],
              ["목표 저축", s.goalSaving],
              ["변동 지출", s.variableExpense],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="flex justify-between gap-2 sm:grid sm:gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">
                <Money value={v} compact />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** ③ 이번 달 저축 — 실제 (SAVE_INVEST + LOAN_REPAY) / 목표 저축 */
export function SavingCard({ actual, target }: { actual: bigint; target: bigint }) {
  if (target === 0n && actual === 0n) return null;
  const ratio = target > 0n ? Number(actual) / Number(target) : 1;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>이번 달 저축</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span>
            <Money value={actual} className="text-lg font-bold" />
            {target > 0n ? (
              <span className="text-sm text-muted-foreground">
                {" "}
                / <Money value={target} compact />
              </span>
            ) : null}
          </span>
          {target > 0n ? <span className="text-sm font-semibold tabular">{formatPercent(ratio, 0)}</span> : null}
        </div>
        {target > 0n ? <Bar ratio={ratio} tone={ratio >= 1 ? "good" : "accent"} label="이번 달 저축 진행률" /> : null}
      </CardContent>
    </Card>
  );
}
