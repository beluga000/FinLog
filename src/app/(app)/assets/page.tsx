import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { Money } from "@/components/common/money";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountMenu, DeleteArchivedAccountButton, NewAccountButton, RestoreAccountButton, type AccountFormEnv } from "@/features/accounts/components/account-dialogs";
import { TaxRoomCard } from "@/features/accounts/components/tax-room-card";
import { getAccountOverview } from "@/features/accounts/queries";
import { getTaxRoom } from "@/features/accounts/tax";
import { defaultSourceAccount, ownerChoiceOf, PAYMENT_SOURCE_TYPES } from "@/features/accounts/rules";
import { getAccounts } from "@/features/ledger/queries";
import { NetWorthChart } from "@/components/charts/lazy-charts";
import { requireHousehold } from "@/lib/db/context";
import { isLiability } from "@/lib/finance/balance";
import { isLoanRepayment, LOAN_REPAYMENT_LABEL, loanPlan } from "@/lib/finance/loan";
import { formatKRW } from "@/lib/finance/money";
import { parseMonthKey, todayKST } from "@/lib/finance/period";
import { isTaxWrapper, TAX_WRAPPER_LABEL } from "@/lib/finance/tax-accounts";
import { parseViewScope } from "@/lib/finance/visibility";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, VISIBILITY_LABEL } from "@/lib/labels";

export const metadata = { title: "자산" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const [{ accounts, netWorth, trend }, allVisible, taxRoom] = await Promise.all([
    getAccountOverview(ctx, scope, { today, monthStartDay: ctx.household.monthStartDay, trendMonths: 12 }),
    // 출금 계좌 후보·이름은 뷰 스코프(나/배우자)와 상관없이 가계 전체에서
    getAccounts(ctx, "us"),
    getTaxRoom(ctx, { today }),
  ]);
  // 보관한 계좌 — 순자산에서 빠지고 여기서만 되돌린다 (뷰 스코프는 위 목록과 같게)
  const archived = (await getAccounts(ctx, scope, { includeArchived: true })).filter((a) => a.isArchived);
  const nameById = new Map(allVisible.map((a) => [a.id, a.name]));
  const env: AccountFormEnv = {
    isCouple: ctx.isCouple,
    partnerName: ctx.partner?.name ?? null,
    paymentOptions: allVisible.filter((a) => PAYMENT_SOURCE_TYPES.includes(a.type)).map((a) => ({ id: a.id, name: a.name })),
    defaultSourceId: defaultSourceAccount(allVisible, ctx.userId)?.id ?? null,
  };
  const billingLabel = (a: { billingDay: number | null; paymentAccountId: string | null }) =>
    a.billingDay === null && !a.paymentAccountId
      ? null
      : [a.billingDay ? `매월 ${a.billingDay}일 결제` : null, a.paymentAccountId ? nameById.get(a.paymentAccountId) : null]
          .filter(Boolean)
          .join(" · ");
  // 대출: 상환 방식 · 금리 · 다음 납입액(이자) · 출금 계좌
  const loanLabel = (a: (typeof accounts)[number]) => {
    const repayment = isLoanRepayment(a.loanRepayment) ? a.loanRepayment : null;
    const plan =
      repayment && a.interestRate !== null
        ? loanPlan({ balance: -a.balance, annualRate: a.interestRate, repayment, payDay: a.billingDay, maturityDate: a.maturityDate }, today)
        : null;
    return [
      a.depositLoan ? "보증금 대출 · 순자산 제외" : null,
      repayment ? LOAN_REPAYMENT_LABEL[repayment] : null,
      a.interestRate !== null ? `연 ${Math.round(a.interestRate * 1_000_000) / 10_000}%` : null,
      plan ? `${plan.next.date ? `${Number(plan.next.date.slice(8))}일 ` : "매달 "}${formatKRW(plan.next.total)}${plan.next.principal > 0n ? ` (이자 ${formatKRW(plan.next.interest)})` : " 이자"}` : null,
      a.maturityDate ? `${a.maturityDate.replaceAll("-", ".")} 만기` : null,
      a.paymentAccountId ? nameById.get(a.paymentAccountId) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const groups = ACCOUNT_TYPE_ORDER.map((type) => ({ type, items: accounts.filter((a) => a.type === type) })).filter((g) => g.items.length);
  const ownerLabel = (owner: string | null) =>
    owner === null ? "공동" : owner === ctx.userId ? ctx.user.name : ctx.partner?.name ?? "배우자";

  return (
    <div className="grid gap-5">
      <PageHeader
        title="자산"
        description="계좌 잔액 = 마지막으로 맞춘 잔액 + 이후 거래"
        actions={
          <>
            <Link href="/assets/savings" className={buttonVariants({ variant: "outline" })}>
              <PiggyBank /> 고정 저축
            </Link>
            <NewAccountButton env={env} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
        <Card data-hero="">
          <CardContent className="grid gap-4">
            <div>
              <div className="text-xs text-muted-foreground">순자산</div>
              <div className="text-3xl font-black"><Money value={netWorth.netWorth} /></div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">자산</dt>
                <dd className="font-semibold"><Money value={netWorth.assets} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">부채</dt>
                <dd className="font-semibold"><Money value={netWorth.liabilities} /></dd>
              </div>
            </dl>
            {netWorth.depositLoans > 0n ? (
              <p className="-mt-2 text-xs text-muted-foreground">
                보증금 대출 <Money value={netWorth.depositLoans} />은 보증금으로 묶여 있어 순자산에서 뺐어요.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>순자산 추이 (월말)</CardTitle>
          </CardHeader>
          <CardContent>
            <NetWorthChart
              height={170}
              data={trend.map((p) => ({
                month: p.month,
                label: `${parseMonthKey(p.month).m}월`,
                netWorth: Number(p.netWorth),
                assets: Number(p.assets),
                liabilities: Number(p.liabilities),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {taxRoom ? <TaxRoomCard room={taxRoom} showOwner={ctx.isCouple} /> : null}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            생활비 통장과 자주 쓰는 카드부터 등록해 보세요. 잔액만 입력하면 돼요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const total = g.items.reduce((s, a) => s + a.balance, 0n);
            const liability = isLiability(g.type);
            return (
              <section key={g.type} className="grid min-w-0 grid-cols-1 content-start gap-1.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold">{ACCOUNT_TYPE_LABEL[g.type]}</h2>
                  <Money value={liability ? -total : total} className="text-sm text-muted-foreground" />
                </div>
                <ul className="divide-y rounded-xl border">
                  {g.items.map((a) => {
                    return (
                      <li key={a.id} className="flex items-center gap-2 py-2 pr-1 pl-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[
                              isTaxWrapper(a.taxWrapper) ? TAX_WRAPPER_LABEL[a.taxWrapper] : null,
                              a.institution,
                              a.type === "CREDIT_CARD" ? billingLabel(a) : null,
                              a.type === "SAVINGS" && a.maturityDate ? `${a.maturityDate.replaceAll("-", ".")} 만기` : null,
                              ctx.isCouple ? ownerLabel(a.ownerUserId) : null,
                              ctx.isCouple ? VISIBILITY_LABEL[a.defaultVisibility] : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {/* 대출 상환 정보는 길어서 줄을 따로 (좁은 화면에서 줄바꿈) */}
                          {a.type === "LOAN" && loanLabel(a) ? <div className="text-xs text-muted-foreground">{loanLabel(a)}</div> : null}
                        </div>
                        <Money value={liability ? -a.balance : a.balance} className="text-sm font-semibold" />
                        <AccountMenu
                          account={{
                            id: a.id,
                            name: a.name,
                            type: a.type,
                            institution: a.institution,
                            owner: ownerChoiceOf(a.ownerUserId, ctx.userId),
                            defaultVisibility: a.defaultVisibility,
                            billingDay: a.billingDay,
                            paymentAccountId: a.paymentAccountId,
                            openedOn: a.openedOn,
                            maturityDate: a.maturityDate,
                            interestRate: a.interestRate,
                            savingsProduct: a.savingsProduct,
                            savingsTier: a.savingsTier,
                            loanRepayment: a.loanRepayment,
                            depositLoan: a.depositLoan,
                            taxWrapper: a.taxWrapper,
                            isArchived: a.isArchived,
                          }}
                          balance={a.balance}
                          env={env}
                        />
                      </li>
                    );
                  })}
                </ul>
                {liability ? <p className="px-1 text-xs text-muted-foreground">갚아야 할 금액으로 표시</p> : null}
              </section>
            );
          })}
        </div>
      )}

      {archived.length ? (
        <details className="group rounded-xl border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm">
            <span className="font-semibold">보관한 계좌 {archived.length}개</span>
            <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">접기</span>
          </summary>
          <ul className="divide-y border-t">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-2 pr-2 pl-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[ACCOUNT_TYPE_LABEL[a.type], a.institution, ctx.isCouple ? ownerLabel(a.ownerUserId) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Link href={`/ledger?account=${a.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  거래 내역
                </Link>
                <RestoreAccountButton id={a.id} />
                <DeleteArchivedAccountButton id={a.id} name={a.name} />
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">보관한 계좌는 순자산과 계좌 선택에서 빠져요. 거래 기록은 그대로 남아 있어요. 거래가 없는 계좌는 삭제할 수 있어요.</p>
        </details>
      ) : null}
    </div>
  );
}
