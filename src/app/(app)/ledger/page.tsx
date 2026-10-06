import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MonthCalendar } from "@/features/ledger/components/month-calendar";
import { TxList } from "@/features/ledger/components/tx-list";
import { getAccounts, getCategories, getScopedTransactions } from "@/features/ledger/queries";
import { materializeRecurring } from "@/features/ledger/service";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, getMonthRange, todayKST } from "@/lib/finance/period";
import { calculateMonthlyStats } from "@/lib/finance/stats";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import type { TxType } from "@/lib/finance/types";
import { parseViewScope } from "@/lib/finance/visibility";

export const metadata = { title: "가계부" };

const TYPE_FILTERS: { value: string; label: string; types: TxType[] }[] = [
  { value: "", label: "전체", types: [] },
  { value: "expense", label: "지출", types: ["EXPENSE"] },
  { value: "income", label: "수입", types: ["INCOME"] },
  { value: "saving", label: "저축·투자", types: ["SAVE_INVEST", "LOAN_REPAY"] },
  { value: "transfer", label: "이체·보정", types: ["TRANSFER", "ADJUSTMENT"] },
];

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

  const typeFilter = TYPE_FILTERS.find((f) => f.value === sp.type) ?? TYPE_FILTERS[0];
  const day = sp.day && sp.day >= range.start && sp.day < range.end ? sp.day : undefined;
  const filtered = items.filter(
    (t) =>
      (!typeFilter.types.length || typeFilter.types.includes(t.type)) &&
      (!day || t.date === day) &&
      (!sp.account || t.fromAccountId === sp.account || t.toAccountId === sp.account),
  );

  const baseParams = { scope: scope === "us" ? undefined : scope, type: sp.type, account: sp.account };
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...baseParams, month, day, ...patch })) if (v) q.set(k, v);
    return `/ledger?${q.toString()}`;
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="가계부"
        actions={
          <>
            <MonthNav month={month} monthStartDay={monthStartDay} basePath="/ledger" params={baseParams} />
            <Link href="/ledger/recurring" className={buttonVariants({ variant: "outline" })}>
              <CalendarClock /> 정기 거래
            </Link>
          </>
        }
      />

      <dl className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid content-start gap-3">
          <MonthCalendar range={range} daily={daily} today={today} selected={day} hrefFor={(d) => href({ day: d ?? undefined })} />
        </div>
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={href({ type: f.value || undefined })}
                scroll={false}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  typeFilter.value === f.value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </Link>
            ))}
            {day ? (
              <Link href={href({ day: undefined })} scroll={false} className="rounded-full bg-muted px-3 py-1 text-xs">
                {Number(day.slice(5, 7))}/{Number(day.slice(8))} 필터 해제 ✕
              </Link>
            ) : null}
            {sp.account ? (
              <Link href={href({ account: undefined })} scroll={false} className="rounded-full bg-muted px-3 py-1 text-xs">
                {accounts.find((a) => a.id === sp.account)?.name ?? "계좌"} 필터 해제 ✕
              </Link>
            ) : null}
          </div>
          <TxList
            items={filtered}
            accounts={accounts}
            categories={categories}
            viewerId={ctx.userId}
            isCouple={ctx.isCouple}
            partnerName={ctx.partner?.name ?? "배우자"}
          />
          <p className="text-xs text-muted-foreground">
            {TX_TYPE_META.TRANSFER.label}·잔액보정은 수입/지출 통계에 포함되지 않아요.
          </p>
        </div>
      </div>
    </div>
  );
}
