import Link from "next/link";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AutoSaveButton } from "@/features/goals/components/goal-autosave";
import { PriorityButtons } from "@/features/goals/components/goal-controls";
import { NewGoalButton } from "@/features/goals/components/goal-form";
import { FastTrackBadge, GoalEta, GoalPace, GoalProgressBar, RequiredLine } from "@/features/goals/components/goal-status";
import { getAutoSaveSetup, getGoalsOverview, pickSurplusGoal } from "@/features/goals/queries";
import { requireHousehold } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";
import { withRo } from "@/lib/labels";

export const metadata = { title: "목표" };

export default async function GoalsPage() {
  const ctx = await requireHousehold();
  const { goals, capacity, totalDemand, accounts, netWorth, claims } = await getGoalsOverview(ctx, {
    today: todayKST(),
    monthStartDay: ctx.household.monthStartDay,
  });
  const over = totalDemand > capacity.capacity;
  // 평균 남는 돈 → 매달 자동으로 옮기기 (곧 끝나는 목표 먼저)
  const surplusGoal = capacity.avgSurplus > 0 ? pickSurplusGoal(goals) : null;
  const surplusSetup = surplusGoal ? await getAutoSaveSetup(ctx, surplusGoal.linkedAccountIds) : null;

  return (
    <div className="grid gap-5">
      <PageHeader title="목표" description="우선순위가 높은 목표부터 저축 가능액을 배분해요." actions={<NewGoalButton accounts={accounts} netWorth={netWorth} claims={claims} />} />

      <Card size="sm" data-hero="">
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">월 저축 가능액</div>
            <div className="text-lg font-bold"><Money value={capacity.capacity} /></div>
            <div className="text-xs text-muted-foreground">
              {capacity.basisMonths ? `최근 ${capacity.basisMonths}개월 평균 저축·투자액` : "지난달 기록이 쌓이면 계산돼요"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">목표들이 필요로 하는 금액</div>
            <div className={cn("text-lg font-bold", over && "text-warning")}><Money value={totalDemand} /></div>
            <div className="text-xs text-muted-foreground">{over ? "저축 가능액보다 많아요 — 우선순위가 낮은 목표가 밀려요" : "저축 가능액 안에서 감당 가능"}</div>
          </div>
          {capacity.avgSurplus > 0 ? (
            <div>
              <div className="text-xs text-muted-foreground">평균 남는 돈</div>
              <div className="text-lg font-bold"><Money value={capacity.avgSurplus} /></div>
              <div className="text-xs text-muted-foreground">
                {surplusGoal ? `${withRo(surplusGoal.name)} 돌리면 목표가 빨라져요` : "저축으로 돌리면 목표가 빨라져요"}
              </div>
              {surplusGoal && surplusSetup ? (
                <div className="mt-2">
                  <AutoSaveButton
                    goal={{
                      id: surplusGoal.id,
                      name: surplusGoal.name,
                      targetDate: surplusGoal.targetDate,
                      linkedAccountIds: surplusGoal.linkedAccountIds,
                      committed: surplusGoal.contributionSource === "commit",
                    }}
                    accounts={accounts}
                    setup={surplusSetup}
                    // 달마다 남는 돈이 달라 절반부터 — 금액은 창에서 바꿀 수 있다
                    monthly={Math.floor(capacity.avgSurplus / 2 / 10_000) * 10_000}
                    label="매달 자동으로 옮기기"
                    offerCommit={false}
                    size="sm"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            비상금, 내 집 마련, 은퇴자금처럼 모으고 싶은 목표를 만들어 보세요.
          </CardContent>
        </Card>
      ) : (
        <ol className="grid gap-3">
          {goals.map((g, i) => (
            <li key={g.id}>
              <Card size="sm" className={cn(g.status !== "ACTIVE" && "opacity-70")}>
                <CardContent className="flex gap-2">
                  <PriorityButtons id={g.id} first={i === 0} last={i === goals.length - 1} />
                  <Link href={`/goals/${g.id}`} className="grid min-w-0 flex-1 gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                        <span className="text-xs text-muted-foreground tabular">#{g.priority}</span>
                        {g.name}
                        <FastTrackBadge goal={g} />
                      </div>
                      <div className="text-sm tabular">
                        <Money value={g.current} compact /> <span className="text-muted-foreground">/ <Money value={g.targetAmount} compact /></span>
                      </div>
                    </div>
                    <GoalProgressBar goal={g} />
                    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex flex-wrap gap-x-2">
                        <GoalPace goal={g} />
                        <GoalEta goal={g} />
                      </span>
                      <span>
                        {g.targetDate.replaceAll("-", ".")} · <RequiredLine goal={g} />
                        {g.status === "ACTIVE" ? (
                          <> · 배분 <Money value={g.contribution} compact />{g.contributionSource === "commit" ? " (확정)" : ""}</>
                        ) : null}
                      </span>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
