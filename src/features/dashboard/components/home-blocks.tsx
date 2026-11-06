import Link from "next/link";
import { cn } from "cn";
import { HiddenMoney } from "@/components/common/hidden-money";
import { Money } from "@/components/common/money";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FastTrackBadge, GoalEta, GoalPace, GoalProgressBar, needsAdjust } from "@/features/goals/components/goal-status";
import type { GoalView } from "@/features/goals/queries";
import { formatPercent } from "@/lib/finance/money";
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
export function PrimaryGoalCard({ goals }: { goals: GoalView[] }) {
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
          {/* 지금 모인 돈은 가려 두고 눌러야 보인다 — 목표 금액·진척률은 그대로 */}
          <HiddenMoney value={Number(primary.current)} label="지금 모인 돈" className="text-2xl font-bold" />
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
          <GoalEta goal={primary} className="text-xs" />
        </div>
        {needsAdjust(primary) ? (
          <Link
            href={`/goals/${primary.id}#adjust`}
            className="inline-flex h-8 w-fit items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
          >
            어떻게 맞출지 보기
          </Link>
        ) : null}
        {others.length ? (
          <ul className="grid gap-1.5 border-t pt-3">
            {others.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.id}`} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm hover:underline">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{g.name}</span>
                    <FastTrackBadge goal={g} />
                  </span>
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

/** "2026-11-25" → "25일" */
const dayLabel = (d: DateStr) => `${Number(d.slice(8))}일`;

/**
 * ② 오늘 쓸 수 있는 돈 (§2-7) — 매일 여는 이유라 휴대폰 홈 맨 위에 둔다.
 * 큰 숫자는 하루 몫 하나, 이번 달 남은 돈은 보조 줄. yesterday = 어제 아낀(+)·더 쓴(−) 돈 (yesterdayResult).
 */
export function SpendableCard({
  spendable: s,
  hasIncome,
  yesterday,
}: {
  spendable: Spendable;
  hasIncome: boolean;
  yesterday: bigint | null;
}) {
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
    // 홈의 대표 카드 — 테마색으로 채운다 (globals.css 의 data-hero)
    <Card data-hero="">
      <CardHeader>
        <CardTitle>오늘 쓸 수 있는 돈</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Money value={s.daily} compact className="text-3xl font-black" />
          {yesterday !== null && yesterday !== 0n ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                yesterday > 0n ? "bg-good/15 text-good" : "bg-warning/15 text-warning",
              )}
            >
              어제 <Money value={yesterday > 0n ? yesterday : -yesterday} compact /> {yesterday > 0n ? "아꼈어요" : "더 썼어요"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {s.overspent ? (
            <span className="font-medium text-critical">
              이번 달 <Money value={-s.remaining} compact /> 초과
            </span>
          ) : (
            <>
              이번 달 남은 돈 <Money value={s.remaining} compact className="font-semibold text-foreground" />
            </>
          )}{" "}
          · {s.daysLeft}일 남음
        </p>
        <div className="grid gap-1">
          <Bar ratio={ratio} tone={tone} label="생활비 사용 비율" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              생활비 <Money value={s.variableExpense} compact /> 썼어요
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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-xs sm:grid-cols-5">
          {(
            [
              ["수입", s.income],
              ["고정비", s.fixed],
              ["고정 저축", s.fixedSaving],
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

/** 월말에 남은 돈을 보여 줄 기준 — 남은 일수와 최소 금액 */
export const MONTH_END_DAYS = 3;
export const MONTH_END_MIN = 10_000n;

/**
 * 월말 남은 돈 — 그냥 두면 다음 달 생활비에 섞이므로 목표 계좌로 옮기는 기록을 권한다.
 * action 은 옮기기 버튼(클라이언트) — 페이지가 계좌·카테고리를 넘겨 그린다.
 */
export function MonthEndSurplusCard({
  amount,
  daysLeft,
  goalName,
  action,
}: {
  amount: bigint;
  daysLeft: number;
  goalName: string;
  action: React.ReactNode;
}) {
  return (
    <section className="grid gap-2 rounded-xl bg-brand-soft p-4" aria-label="이번 달 남은 돈">
      <p className="text-sm text-muted-foreground">이번 달 {daysLeft}일 남았어요 · 지금 남은 돈</p>
      <Money value={amount} className="text-2xl font-bold" />
      <p className="text-sm text-muted-foreground">그냥 두면 다음 달 생활비와 섞여요. {goalName} 계좌로 옮겨 두면 목표가 빨라져요.</p>
      <div className="flex flex-wrap gap-2">{action}</div>
    </section>
  );
}

/**
 * ③ 이번 달 저축 — 실제 (SAVE_INVEST + LOAN_REPAY) / 계획 저축 (고정 저축 + 목표 저축).
 * 남은 자동이체(scheduled)는 점선으로 함께 그려 월초 0%가 실패로 읽히지 않게 하고,
 * 자동이체가 없는 계획분은 직접 옮겨야 한다고 알려 준다.
 */
export function SavingCard({
  actual,
  target,
  scheduled = 0n,
  scheduledDate = null,
}: {
  actual: bigint;
  target: bigint;
  scheduled?: bigint;
  scheduledDate?: DateStr | null;
}) {
  if (target === 0n && actual === 0n) return null;
  const ratio = target > 0n ? Number(actual) / Number(target) : 1;
  const filled = Math.min(100, ratio * 100);
  const scheduledPct = target > 0n ? Math.min(100 - filled, (Number(scheduled) / Number(target)) * 100) : 0;
  const manual = target - actual - scheduled;
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
        {target > 0n ? (
          <div
            className="relative h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(filled)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="이번 달 저축 진행률"
          >
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full", ratio >= 1 && "bg-good")}
              style={{ width: `${filled}%`, ...(ratio < 1 ? { background: "var(--brand)" } : {}) }}
            />
            {scheduledPct > 0 ? (
              <div
                className="absolute inset-y-0"
                aria-hidden
                style={{
                  left: `${filled}%`,
                  width: `${scheduledPct}%`,
                  background: "repeating-linear-gradient(90deg, color-mix(in oklab, var(--brand) 55%, transparent) 0 4px, transparent 4px 7px)",
                }}
              />
            ) : null}
          </div>
        ) : null}
        {scheduled > 0n ? (
          <p className="text-xs text-muted-foreground">
            {scheduledDate ? `${dayLabel(scheduledDate)} ` : ""}자동이체 <Money value={scheduled} compact /> 예정
          </p>
        ) : null}
        {manual > 0n && target > 0n ? (
          <p className="text-xs text-muted-foreground">
            자동이체가 없는 <Money value={manual} compact />은 직접 옮겨야 해요.{" "}
            <Link href="/goals" className="font-medium text-foreground underline underline-offset-4">
              목표에서 자동이체 만들기
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
