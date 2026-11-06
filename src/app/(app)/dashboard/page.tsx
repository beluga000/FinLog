import Link from "next/link";
import { Suspense } from "react";
import { Money } from "@/components/common/money";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryGoalCard, SavingCard, SpendableCard } from "@/features/dashboard/components/home-blocks";
import { ReviewList } from "@/features/dashboard/components/review-list";
import {
  computeSpendable,
  getMonthSaving,
  getRecentTransactions,
  getReviewItems,
  getSpendableSource,
} from "@/features/dashboard/home";
import { GoalMilestoneCard } from "@/features/goals/components/goal-milestone";
import { getGoalsOverview } from "@/features/goals/queries";
import { TxList } from "@/features/ledger/components/tx-list";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, getMonthRange, todayKST } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";
import { parseViewScope, type ViewScope } from "@/lib/finance/visibility";
import { SCOPE_LABEL } from "@/lib/labels";

export const metadata = { title: "홈" };

/** 홈 (PROD.MD §2-8): 대표 목표 → 쓸 수 있는 돈 → 이번 달 저축 → 확인할 일 → 최근 기록 */
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
  const [goals, source, saving, current] = await Promise.all([
    goalsP,
    goalsP.then((goals) => getSpendableSource(ctx, scope, { today, monthStartDay, goals })),
    getMonthSaving(ctx, scope, range),
    getScopedTransactions(ctx, range, scope),
  ]);
  const spendable = computeSpendable(source);
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];
  const partnerName = ctx.partner?.name ?? "배우자";
  const ledgerHref = scope === "us" ? "/ledger" : `/ledger?scope=${scope}`;
  // 진행률 알림은 우선순위가 가장 높은 목표 하나만
  const milestoneGoal = goals.find((g) => g.milestone !== null) ?? null;

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

      {/* 모바일은 DOM 순서대로 1단, 데스크톱은 왼쪽(목표·최근 기록) / 오른쪽(쓸 수 있는 돈·저축·확인할 일) */}
      <div className="grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_1fr] lg:items-start">
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
          <PrimaryGoalCard goals={goals} today={today} />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <SpendableCard spendable={spendable} hasIncome={spendable.income > 0n} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-2 lg:row-start-2">
          <SavingCard actual={saving} target={spendable.plannedSaving} />
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
