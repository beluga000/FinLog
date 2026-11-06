import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LedgerBrowser } from "@/features/ledger/components/ledger-browser";
import { TYPE_FILTERS } from "@/features/ledger/filters";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, getMonthRange, todayKST } from "@/lib/finance/period";
import { calculateMonthlyStats } from "@/lib/finance/stats";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import { parseViewScope } from "@/lib/finance/visibility";

export const metadata = { title: "가계부" };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string; type?: string; day?: string; account?: string }>;
}) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const { monthStartDay } = ctx.household;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : getMonthKey(today, monthStartDay);
  const range = getMonthRange(month, monthStartDay);

  await materializeRecurring(ctx.householdId, today);
  const [{ items, summarized }, categories, accounts] = await Promise.all([
    getScopedTransactions(ctx, range, scope),
    getCategories(ctx),
    getAccounts(ctx, "us"),
  ]);

  const stats = calculateMonthlyStats([...items, ...summarized], categories);
  const daily = new Map<string, { income: bigint; expense: bigint }>();
  for (const t of [...items, ...summarized]) {
    if (t.type !== "EXPENSE" && t.type !== "INCOME") continue;
    const cur = daily.get(t.date) ?? { income: 0n, expense: 0n };
    if (t.type === "EXPENSE") cur.expense += t.amount;
    else cur.income += t.amount;
    daily.set(t.date, cur);
  }

  const typeValue = TYPE_FILTERS.some((f) => f.value === sp.type) ? sp.type! : "";
  const day = sp.day && sp.day >= range.start && sp.day < range.end ? sp.day : undefined;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="가계부"
        actions={
          <>
            <MonthNav
              month={month}
              monthStartDay={monthStartDay}
              basePath="/ledger"
              params={{ scope: scope === "us" ? undefined : scope }}
              keepFromUrl={["type", "account"]}
            />
            <Link href="/ledger/recurring" className={buttonVariants({ variant: "outline" })}>
              <CalendarClock /> 정기 거래
            </Link>
          </>
        }
      />

      <dl data-hero="" className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">수입</dt>
          <dd className="font-semibold"><Money value={stats.income} compact /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">지출</dt>
          <dd className="font-semibold"><Money value={stats.expense} compact /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">저축·투자</dt>
          <dd className="font-semibold"><Money value={stats.saving} compact /></dd>
        </div>
      </dl>
      {summarized.length ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          {ctx.partner?.name ?? "배우자"}님의 &lsquo;합계만 공개&rsquo; {summarized.length}건이 합계에만 포함되어 있어요.
        </p>
      ) : null}

      <LedgerBrowser
        key={`${month}:${scope}`}
        items={items}
        daily={[...daily.entries()]}
        range={range}
        today={today}
        initial={{ type: typeValue, day, account: sp.account }}
        accounts={accounts}
        categories={categories}
        viewerId={ctx.userId}
        isCouple={ctx.isCouple}
        partnerName={ctx.partner?.name ?? "배우자"}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        {TX_TYPE_META.TRANSFER.label}·잔액보정은 수입/지출 통계에 포함되지 않아요.
      </p>
    </div>
  );
}
