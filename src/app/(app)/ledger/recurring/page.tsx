import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { NewRecurringButton, RecurringRuleControls } from "@/features/ledger/components/recurring-controls";
import { getAccounts, getCategories, getRecurringRules } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";

export const metadata = { title: "정기 거래" };

const ADJUST_LABEL = { NONE: "", PREV: " · 주말이면 앞당김", NEXT: " · 주말이면 미룸" } as const;

export default async function RecurringPage() {
  const ctx = await requireHousehold();
  const [rules, accounts, categories] = await Promise.all([getRecurringRules(ctx), getAccounts(ctx, "us"), getCategories(ctx)]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="grid gap-5">
      <Link href="/ledger" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 가계부
      </Link>
      <PageHeader
        title="정기 거래"
        description="월급·월세·통신비·적금처럼 매달 반복되는 거래를 자동으로 기록해요. 생성된 거래는 고정비로 분류돼요."
        actions={<NewRecurringButton accounts={accounts} categories={categories} viewerId={ctx.userId} isCouple={ctx.isCouple} />}
      />
      {rules.length === 0 ? (
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">등록된 정기 거래가 없어요.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rules.map((r) => {
            const t = r.template;
            const accountText =
              t.type === "EXPENSE"
                ? accountName.get(t.fromAccountId ?? "")
                : t.type === "INCOME"
                  ? accountName.get(t.toAccountId ?? "")
                  : `${accountName.get(t.fromAccountId ?? "") ?? "?"} → ${accountName.get(t.toAccountId ?? "") ?? "?"}`;
            return (
              <li key={r.id} className={cn("flex items-center gap-3 px-3 py-3", !r.isActive && "opacity-60")}>
                <div className="w-12 shrink-0 text-center text-sm font-semibold tabular">{r.dayOfMonth === 0 ? "말일" : `${r.dayOfMonth}일`}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.name}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{TX_TYPE_META[t.type].label}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[categoryName.get(t.categoryId ?? ""), accountText].filter(Boolean).join(" · ")}
                    {ADJUST_LABEL[r.businessDayAdjust]}
                    {r.lastRunOn ? ` · 최근 ${r.lastRunOn.slice(5).replace("-", "/")}` : ""}
                    {!r.isActive ? " · 중지됨" : ""}
                  </div>
                </div>
                <Money value={BigInt(t.amount)} className="text-sm font-semibold" />
                {r.createdByUserId === ctx.userId ? <RecurringRuleControls id={r.id} isActive={r.isActive} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
