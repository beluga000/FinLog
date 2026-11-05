import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalAlternativesCard } from "@/features/goals/components/goal-alternatives";
import { CommitButton, GoalMenu } from "@/features/goals/components/goal-controls";
import { GoalPace, GoalProgressBar } from "@/features/goals/components/goal-status";
import { GoalWhatIf } from "@/features/goals/components/goal-what-if";
import { getGoalsOverview } from "@/features/goals/queries";
import { requireHousehold } from "@/lib/db/context";
import { formatPercent } from "@/lib/finance/money";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "목표" };

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireHousehold();
  const today = todayKST();
  const { goals, accounts, capacity, netWorth } = await getGoalsOverview(ctx, { today, monthStartDay: ctx.household.monthStartDay });
  const goal = goals.find((g) => g.id === id);
  if (!goal) notFound();

  const e = goal.evaluation;

  return (
    <div className="grid gap-5">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 목표
      </Link>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{goal.name}</h1>
          <span className="text-sm text-muted-foreground">
            {goal.targetDate.replaceAll("-", ".")}까지 · {e.monthsLeft}개월 남음
          </span>
        </div>
        <div className="text-3xl font-black tabular">
          <Money value={goal.current} /> <span className="text-base font-medium text-muted-foreground">/ <Money value={goal.targetAmount} /></span>
        </div>
        <GoalProgressBar goal={goal} />
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <GoalPace goal={goal} className="font-medium" />
          <span className="text-muted-foreground">진척 {formatPercent(e.progress, 0)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {goal.usesNetWorth ? "연결 계좌가 없어 순자산을 기준으로 계산해요." : `연결 계좌: ${goal.linkedAccountNames.join(", ")}`}
          {goal.targetIsReal ? ` · 오늘 가치 기준 (목표 시점 명목 ${Math.round(e.required.nominalTarget / 1e4).toLocaleString("ko-KR")}만원)` : ""}
          {` · 기대수익률 연 ${(goal.expectedReturn * 100).toFixed(1)}%`}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>매달 필요한 금액</CardTitle>
            <CardDescription>목표일에 맞추려면</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {e.required.alreadyAchievable ? (
              <p className="text-lg font-bold text-good">추가 납입 없이도 달성 가능해요</p>
            ) : (
              <div className="text-2xl font-bold"><Money value={e.required.monthly} /></div>
            )}
            <div className="text-sm text-muted-foreground">
              지금 배분된 금액 <Money value={goal.contribution} className="font-medium text-foreground" />
              {goal.contributionSource === "commit" ? " (확정)" : " (저축 가능액 자동 배분)"}
              {goal.shortfall > 0 ? <> · 우선순위에 밀려 <Money value={goal.shortfall} /> 부족</> : null}
            </div>
            {goal.status === "ACTIVE" && !e.required.alreadyAchievable ? (
              <div>
                <CommitButton id={goal.id} monthly={e.required.monthly} committed={goal.contributionSource === "commit"} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <GoalAlternativesCard goal={goal} today={today} capacity={capacity.capacity} />
      </div>

      <GoalWhatIf
        today={today}
        goal={{
          id: goal.id,
          targetAmount: goal.targetAmount,
          targetIsReal: goal.targetIsReal,
          targetDate: goal.targetDate,
          expectedReturn: goal.expectedReturn,
          current: goal.current,
          contribution: goal.contribution,
          editable: goal.status !== "ACHIEVED",
        }}
      />

      <GoalMenu
        goal={{
          id: goal.id,
          name: goal.name,
          targetAmount: goal.targetAmount,
          targetIsReal: goal.targetIsReal,
          targetDate: goal.targetDate,
          expectedReturn: goal.expectedReturn,
          linkedAccountIds: goal.linkedAccountIds,
          monthlyCommit: goal.monthlyCommit,
          status: goal.status,
        }}
        accounts={accounts}
        netWorth={netWorth}
      />
      <p className="text-xs text-muted-foreground">투자 권유가 아닌 참고용 시뮬레이션이며, 과거 수익률이 미래 수익을 보장하지 않습니다.</p>
    </div>
  );
}
