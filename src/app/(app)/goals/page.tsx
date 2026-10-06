import Link from "next/link";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PriorityButtons } from "@/features/goals/components/goal-controls";
import { NewGoalButton } from "@/features/goals/components/goal-form";
import { GoalPace, GoalProgressBar, RequiredLine } from "@/features/goals/components/goal-status";
import { getGoalsOverview } from "@/features/goals/queries";
import { requireHousehold } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "목표" };

export default async function GoalsPage() {
  const ctx = await requireHousehold();
  const { goals, capacity, totalDemand, accounts } = await getGoalsOverview(ctx, {
    today: todayKST(),
    monthStartDay: ctx.household.monthStartDay,
  });
  const over = totalDemand > capacity.capacity;

  return (
    <div className="grid gap-5">
      <PageHeader title="목표" description="우선순위가 높은 목표부터 저축 가능액을 배분해요." actions={<NewGoalButton accounts={accounts} />} />

      <Card size="sm">
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
            <div className={cn("text-lg font-bold", over && "text-critical")}><Money value={totalDemand} /></div>
            <div className="text-xs text-muted-foreground">{over ? "저축 가능액보다 많아요 — 우선순위가 낮은 목표가 밀려요" : "저축 가능액 안에서 감당 가능"}</div>
          </div>
          {capacity.avgSurplus > 0 ? (
            <div>
              <div className="text-xs text-muted-foreground">평균 남는 돈</div>
              <div className="text-lg font-bold"><Money value={capacity.avgSurplus} /></div>
              <div className="text-xs text-muted-foreground">저축으로 돌리면 목표가 빨라져요</div>
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
                      <div className="font-semibold">
                        <span className="mr-2 text-xs text-muted-foreground tabular">#{g.priority}</span>
                        {g.name}
                      </div>
                      <div className="text-sm tabular">
                        <Money value={g.current} compact /> <span className="text-muted-foreground">/ <Money value={g.targetAmount} compact /></span>
                      </div>
                    </div>
                    <GoalProgressBar goal={g} />
                    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <GoalPace goal={g} />
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
