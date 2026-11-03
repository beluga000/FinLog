import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NewRecurringButton, RecurringList, type RecurringRowView } from "@/features/ledger/components/recurring-controls";
import { getAccounts, getCategories, getRecurringRules } from "@/features/ledger/queries";
import { groupOf, RECURRING_GROUPS, scheduleOf, summarizeRecurring } from "@/features/ledger/recurring-view";
import { requireHousehold } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "정기 거래" };

/** 요약 막대 색 — 대시보드와 같은 의미 색 (지출 chart-2, 저축 chart-3) */
const BAR = { expense: "var(--chart-2)", saving: "var(--chart-3)", remaining: "var(--chart-1)" } as const;

export default async function RecurringPage() {
  const ctx = await requireHousehold();
  const today = todayKST();
  const [rules, accounts, categories] = await Promise.all([getRecurringRules(ctx), getAccounts(ctx, "us"), getCategories(ctx)]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const memberName = new Map(ctx.members.map((m) => [m.id, m.name]));

  const rows: RecurringRowView[] = rules.map((r) => {
    const t = r.template;
    const from = accountName.get(t.fromAccountId ?? "");
    const to = accountName.get(t.toAccountId ?? "");
    const accountText = t.type === "EXPENSE" ? from : t.type === "INCOME" ? to : `${from ?? "?"} → ${to ?? "?"}`;
    return {
      rule: {
        id: r.id,
        name: r.name,
        template: t,
        dayOfMonth: r.dayOfMonth,
        businessDayAdjust: r.businessDayAdjust,
        startDate: r.startDate,
        endDate: r.endDate,
      },
      group: groupOf(t.type),
      detail: [categoryName.get(t.categoryId ?? ""), accountText].filter(Boolean).join(" · "),
      schedule: scheduleOf(r, today),
      lastRunOn: r.lastRunOn,
      isActive: r.isActive,
      isMine: r.createdByUserId === ctx.userId,
      ownerName: r.createdByUserId === ctx.userId ? "나" : memberName.get(r.createdByUserId) ?? "배우자",
    };
  });

  const summary = summarizeRecurring(rules, today);
  const activeCount = rows.filter((r) => r.schedule.status === "active").length;
  // 막대 비율: 수입 대비 지출·저축·남는 돈 (지출이 수입보다 크면 지출·저축 합 기준)
  const base = summary.income > summary.expense + summary.saving ? summary.income : summary.expense + summary.saving;
  const pct = (v: bigint) => (base > 0n ? Number((v * 1000n) / base) / 10 : 0);

  const formEnv = { accounts, categories, viewerId: ctx.userId, isCouple: ctx.isCouple };

  return (
    <div className="grid gap-5">
      <Link href="/ledger" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 가계부
      </Link>
      <PageHeader
        title="정기 거래"
        description="월급·월세·통신비·적금처럼 매달 반복되는 거래를 정해진 날 자동으로 기록해요."
        actions={<NewRecurringButton {...formEnv} />}
      />

      {rows.length > 0 ? (
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">정기 거래 기준 매달 남는 돈</div>
                <div className={summary.remaining < 0n ? "text-3xl font-black text-critical" : "text-3xl font-black"}>
                  <Money value={summary.remaining} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">진행 중 {activeCount}건</div>
            </div>

            {base > 0n ? (
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div style={{ width: `${pct(summary.expense)}%`, background: BAR.expense }} />
                <div style={{ width: `${pct(summary.saving)}%`, background: BAR.saving }} />
                {summary.remaining > 0n ? <div style={{ width: `${pct(summary.remaining)}%`, background: BAR.remaining, opacity: 0.35 }} /> : null}
              </div>
            ) : null}

            <dl className="grid grid-cols-3 gap-3 text-sm">
              <SummaryItem label="수입" value={summary.income} />
              <SummaryItem label="지출" value={summary.expense} color={BAR.expense} />
              <SummaryItem label="저축·상환" value={summary.saving} color={BAR.saving} />
            </dl>
            {summary.remaining < 0n ? (
              <p className="text-xs text-critical">정기 지출·저축이 정기 수입보다 많아요. 금액이나 정기 수입 등록을 확인해 보세요.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">아직 등록된 정기 거래가 없어요</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            월급, 월세, 통신비, 보험료, 적금처럼 매달 같은 날 오가는 돈을 등록하면 그날 자동으로 가계부에 기록돼요.
          </p>
          <NewRecurringButton {...formEnv} />
        </div>
      ) : (
        <RecurringList rows={rows} groups={RECURRING_GROUPS} isCouple={ctx.isCouple} partnerName={ctx.partner?.name ?? null} formEnv={formEnv} />
      )}
    </div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: bigint; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {color ? <span className="size-2 rounded-full" style={{ background: color }} aria-hidden /> : null}
        {label}
      </dt>
      <dd className="truncate font-semibold">
        <Money value={value} />
      </dd>
    </div>
  );
}
