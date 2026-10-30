import Link from "next/link";
import { Money } from "@/components/common/money";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrimaryGoalCard, SavingCard, SpendableCard } from "@/features/dashboard/components/home-blocks";
import { ReviewList } from "@/features/dashboard/components/review-list";
import {
  computeSpendable,
  getMonthSaving,
  getRecentTransactions,
  getReviewItems,
  getSpendableSource,
} from "@/features/dashboard/home";
import { getGoalsOverview } from "@/features/goals/queries";
import { TxList } from "@/features/ledger/components/tx-list";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, getMonthRange, todayKST } from "@/lib/finance/period";
import { parseViewScope } from "@/lib/finance/visibility";
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

  const goalsP = getGoalsOverview(ctx, { today, monthStartDay }).then((o) => o.goals);
  const [goals, source, saving, review, recent, current, accounts, categories] = await Promise.all([
    goalsP,
    goalsP.then((goals) => getSpendableSource(ctx, scope, { today, monthStartDay, goals })),
    getMonthSaving(ctx, scope, range),
    getReviewItems(ctx, { today }),
    getRecentTransactions(ctx, scope, { today, limit: 5 }),
    getScopedTransactions(ctx, range, scope),
    getAccounts(ctx, "us"),
    getCategories(ctx),
  ]);
  const spendable = computeSpendable(source);
  const summaryOnlyTotal = current.summarized.reduce((s, t) => (t.type === "EXPENSE" ? s + t.amount : s), 0n);
  const scopeLabel = scope === "partner" ? ctx.partner?.name ?? "배우자" : SCOPE_LABEL[scope];
  const partnerName = ctx.partner?.name ?? "배우자";
  const ledgerHref = scope === "us" ? "/ledger" : `/ledger?scope=${scope}`;

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
        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <PrimaryGoalCard goals={goals} today={today} />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <SpendableCard spendable={spendable} hasIncome={spendable.income > 0n} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-2 lg:row-start-2">
          <SavingCard actual={saving} target={spendable.goalSaving} />
        </div>
        <div className="min-w-0 empty:hidden lg:col-start-2 lg:row-start-3">
          <ReviewList
            items={review}
            accounts={accounts}
            categories={categories}
            viewerId={ctx.userId}
            isCouple={ctx.isCouple}
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-3">
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
              <TxList
                items={recent}
                accounts={accounts}
                categories={categories}
                viewerId={ctx.userId}
                isCouple={ctx.isCouple}
                partnerName={partnerName}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
