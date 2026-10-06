import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalProjectionChart, type GoalChartPoint } from "@/features/goals/components/goal-chart";
import { ApplyAlternativeButton, CommitButton, GoalMenu } from "@/features/goals/components/goal-controls";
import { GoalPace, GoalProgressBar } from "@/features/goals/components/goal-status";
import { DEFAULT_INFLATION, getGoalsOverview } from "@/features/goals/queries";
import { requireHousehold } from "@/lib/db/context";
import { formatPercent } from "@/lib/finance/money";
import { inflate, toMonthlyRate } from "@/lib/finance/projection";
import { toDateStr, todayKST } from "@/lib/finance/period";

export const metadata = { title: "목표" };

function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  return toDateStr(y, m + months, Math.min(d, 28));
}

function monthLabel(date: string) {
  const [y, m] = date.split("-");
  return `${y.slice(2)}.${m}`;
}

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireHousehold();
  const today = todayKST();
  const { goals, accounts } = await getGoalsOverview(ctx, { today, monthStartDay: ctx.household.monthStartDay });
  const goal = goals.find((g) => g.id === id);
  if (!goal) notFound();

  const e = goal.evaluation;
  const r = toMonthlyRate(goal.expectedReturn);
  const horizon = Math.min(480, Math.max(e.monthsLeft, e.projectedMonths ?? e.monthsLeft, 12));
  const step = Math.max(1, Math.ceil(horizon / 60));
  const showRequired = !e.onTrack && !e.required.alreadyAchievable;
  const data: GoalChartPoint[] = [];
  let projected = goal.current;
  let required = goal.current;
  for (let m = 0; m <= horizon; m++) {
    if (m > 0) {
      projected = projected * (1 + r) + goal.contribution;
      required = required * (1 + r) + e.required.monthly;
    }
    if (m % step === 0 || m === horizon || m === e.monthsLeft) {
      data.push({
        label: monthLabel(addMonths(today, m)),
        projected: Math.round(projected),
        required: showRequired && m <= e.monthsLeft ? Math.round(required) : null,
        target: Math.round(goal.targetIsReal ? inflate(goal.targetAmount, m, DEFAULT_INFLATION) : goal.targetAmount),
      });
    }
  }

  const alt = e.alternatives;

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

        <Card>
          <CardHeader>
            <CardTitle>{alt ? "이렇게 조정해 보세요" : "계획대로 가고 있어요"}</CardTitle>
            <CardDescription>
              {alt ? `월 ${Math.round(goal.contribution / 1e4).toLocaleString("ko-KR")}만원 기준 대안` : "지금 배분액을 유지하면 목표일 전에 달성해요"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {alt ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    (a) 기간 연장 —{" "}
                    {alt.extendToMonths === null ? (
                      "100년 안에 어려워요"
                    ) : (
                      <b>{addMonths(today, alt.extendToMonths).slice(0, 7).replace("-", "년 ")}월</b>
                    )}
                  </span>
                  {alt.extendToMonths !== null ? (
                    <ApplyAlternativeButton id={goal.id} label="적용" change={{ targetDate: addMonths(today, alt.extendToMonths) }} />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    (b) 목표 금액 조정 — <b><Money value={alt.reachableTarget} compact /></b>
                  </span>
                  {alt.reachableTarget > 0 ? (
                    <ApplyAlternativeButton id={goal.id} label="적용" change={{ targetAmount: String(alt.reachableTarget) }} />
                  ) : null}
                </div>
                {alt.higherReturn ? (
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        (c) 기대수익률 {(alt.higherReturn.annualReturn * 100).toFixed(1)}% 가정 — 월 <b><Money value={alt.higherReturn.monthly} compact /></b>
                      </span>
                      <ApplyAlternativeButton id={goal.id} label="적용" change={{ expectedReturn: alt.higherReturn.annualReturn }} />
                    </div>
                    <p className="text-xs text-muted-foreground">수익률이 높을수록 손실 가능성(변동성)도 커져요.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">남는 저축 여력은 다음 우선순위 목표로 배분돼요.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>예상 경로</CardTitle>
          <CardDescription>
            월 복리 (1+R)^(1/12)−1, 매월 말 납입 가정
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalProjectionChart data={data} showRequired={showRequired} />
        </CardContent>
      </Card>

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
      />
      <p className="text-xs text-muted-foreground">투자 권유가 아닌 참고용 시뮬레이션이며, 과거 수익률이 미래 수익을 보장하지 않습니다.</p>
    </div>
  );
}
