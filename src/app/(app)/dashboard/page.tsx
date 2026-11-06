import Link from "next/link";
import { Suspense } from "react";
import { Money } from "@/components/common/money";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MONTH_END_DAYS,
  MONTH_END_MIN,
  MonthEndSurplusCard,
  PrimaryGoalCard,
  SavingCard,
  SpendableCard,
} from "@/features/dashboard/components/home-blocks";
import { ReviewList } from "@/features/dashboard/components/review-list";
import {
  computeSpendable,
  getMonthSaving,
  getPlannedRest,
  getRecentTransactions,
  getReviewItems,
  getSpendableSource,
} from "@/features/dashboard/home";
import { GoalMilestoneCard } from "@/features/goals/components/goal-milestone";
import { MoveToGoalButton } from "@/features/goals/components/move-to-goal";
import { getGoalsOverview, getMoveTarget, pickSurplusGoal } from "@/features/goals/queries";
import { TxList } from "@/features/ledger/components/tx-list";
import { getChallengeProgress } from "@/features/reports/challenge";
import { ChallengeChips } from "@/features/reports/components/challenge-controls";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, getMonthRange, todayKST } from "@/lib/finance/period";
import { yesterdayResult } from "@/lib/finance/spendable";
import type { DateStr } from "@/lib/finance/types";
import { parseViewScope, type ViewScope } from "@/lib/finance/visibility";
import { SCOPE_LABEL, withRo } from "@/lib/labels";

export const metadata = { title: "홈" };

/** 홈 (PROD.MD §2-8): 오늘 쓸 수 있는 돈 → 대표 목표 → 이번 달 저축 → 확인할 일 → 최근 기록 (휴대폰 순서) */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const { monthStartDay } = ctx.household;
  const range = getMonthRange(getMonthKey(today, monthStartDay), monthStartDay);

  await materializeRecurring(ctx.householdId, today);

  // 확인할 일·최근 기록은 아래 Suspense 에서 따로 그려, 목표·쓸 수 있는 돈이 먼저 보이게 한다
  const goalsP = getGoalsOverview(ctx, { today, monthStartDay }).then((o) => o.goals);
  const [goals, source, saving, current, planned, challenges] = await Promise.all([
    goalsP,
    goalsP.then((goals) => getSpendableSource(ctx, scope, { today, monthStartDay, goals })),
    getMonthSaving(ctx, scope, range),
    getScopedTransactions(ctx, range, scope),
    getPlannedRest(ctx, scope, { today, range }),
    getChallengeProgress(ctx, { today, monthStartDay }),
  ]);
  const spendable = computeSpendable(source);
  const yesterday = yesterdayResult(source, today);
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];
  const partnerName = ctx.partner?.name ?? "배우자";
  const ledgerHref = scope === "us" ? "/ledger" : `/ledger?scope=${scope}`;
  // 진행률 알림은 우선순위가 가장 높은 목표 하나만
  const milestoneGoal = goals.find((g) => g.milestone !== null) ?? null;
  // 월말 남은 돈 → 목표로 옮기기 ("우리" 뷰만 — 목표는 가구 공동)
  const surplusAmount = (spendable.remaining / 10_000n) * 10_000n;
  const monthEnd =
    scope === "us" && spendable.income > 0n && !spendable.overspent && spendable.daysLeft <= MONTH_END_DAYS && surplusAmount >= MONTH_END_MIN;
  const surplusGoal = monthEnd ? pickSurplusGoal(goals) : null;
  const [moveTarget, accounts, categories] = surplusGoal
    ? await Promise.all([getMoveTarget(ctx, surplusGoal), getAccounts(ctx, "us"), getCategories(ctx)])
    : [null, [], []];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">{ctx.isCouple ? `${scopeLabel}의 ` : ""}이번 달</h1>
        <p className="text-sm text-muted-foreground">{ctx.household.name}</p>
      </div>

      {summaryOnlyTotal > 0n ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {partnerName}님의 &lsquo;합계만 공개&rsquo; 지출 <Money value={summaryOnlyTotal} />이 합계에 포함되어 있어요 (건별 내역은 비공개).
        </p>
      ) : null}

      {/* 모바일은 DOM 순서대로 1단 — 매일 보는 오늘 쓸 수 있는 돈을 맨 위에. 데스크톱은 왼쪽(목표·최근 기록) / 오른쪽(쓸 수 있는 돈·저축·확인할 일) */}
      <div className="grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_1fr] lg:items-start">
        <div className="grid min-w-0 gap-4 lg:col-start-2 lg:row-start-1">
          {surplusGoal && moveTarget ? (
            <MonthEndSurplusCard
              amount={surplusAmount}
              daysLeft={spendable.daysLeft}
              goalName={surplusGoal.name}
              action={
                <MoveToGoalButton
                  target={moveTarget}
                  amount={surplusAmount}
                  label={`${withRo(surplusGoal.name)} 옮기기 기록`}
                  accounts={accounts}
                  categories={categories}
                  viewerId={ctx.userId}
                  isCouple={ctx.isCouple}
                />
              }
            />
          ) : null}
          <SpendableCard spendable={spendable} hasIncome={spendable.income > 0n} yesterday={yesterday} />
          <ChallengeChips items={challenges} />
        </div>
        <div className="grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
          {milestoneGoal ? (
            <GoalMilestoneCard
              goal={{
                id: milestoneGoal.id,
                name: milestoneGoal.name,
                milestone: milestoneGoal.milestone!,
                progress: milestoneGoal.evaluation.progress,
                aheadMonths: milestoneGoal.evaluation.aheadMonths,
                alreadyAchievable: milestoneGoal.evaluation.required.alreadyAchievable,
              }}
            />
          ) : null}
          <PrimaryGoalCard goals={goals} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-2 lg:row-start-2">
          <SavingCard actual={saving} target={spendable.plannedSaving} scheduled={planned.saving} scheduledDate={planned.savingDate} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-2 lg:row-start-3">
          <Suspense fallback={null}>
            <ReviewSection ctx={ctx} today={today} />
          </Suspense>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-span-3 lg:row-start-2">
          <Card>
            <CardHeader>
              <CardTitle>최근 기록</CardTitle>
              <CardAction>
                <Link href={ledgerHref} className="text-xs text-muted-foreground hover:underline">
                  가계부에서 보기
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<RecentSkeleton />}>
                <RecentSection ctx={ctx} scope={scope} today={today} partnerName={partnerName} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type Ctx = Awaited<ReturnType<typeof requireHousehold>>;

async function ReviewSection({ ctx, today }: { ctx: Ctx; today: DateStr }) {
  const [review, accounts, categories] = await Promise.all([getReviewItems(ctx, { today }), getAccounts(ctx, "us"), getCategories(ctx)]);
  return <ReviewList items={review} accounts={accounts} categories={categories} viewerId={ctx.userId} isCouple={ctx.isCouple} />;
}

async function RecentSection({ ctx, scope, today, partnerName }: { ctx: Ctx; scope: ViewScope; today: DateStr; partnerName: string }) {
  const [recent, accounts, categories] = await Promise.all([
    getRecentTransactions(ctx, scope, { today, limit: 5 }),
    getAccounts(ctx, "us"),
    getCategories(ctx),
  ]);
  return (
    <TxList items={recent} accounts={accounts} categories={categories} viewerId={ctx.userId} isCouple={ctx.isCouple} partnerName={partnerName} />
  );
}

function RecentSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
