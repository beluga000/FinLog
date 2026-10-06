import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountMenu, NewAccountButton } from "@/features/accounts/components/account-dialogs";
import { getAccountOverview } from "@/features/accounts/queries";
import { NetWorthChart } from "@/features/dashboard/components/charts";
import { requireHousehold } from "@/lib/db/context";
import { isLiability } from "@/lib/finance/balance";
import { parseMonthKey, todayKST } from "@/lib/finance/period";
import { parseViewScope } from "@/lib/finance/visibility";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, VISIBILITY_LABEL } from "@/lib/labels";

export const metadata = { title: "자산" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const scope = ctx.isCouple ? parseViewScope(sp.scope) : "us";
  const today = todayKST();
  const { accounts, netWorth, trend } = await getAccountOverview(ctx, scope, {
    today,
    monthStartDay: ctx.household.monthStartDay,
    trendMonths: 12,
  });

  const groups = ACCOUNT_TYPE_ORDER.map((type) => ({ type, items: accounts.filter((a) => a.type === type) })).filter((g) => g.items.length);
  const ownerLabel = (owner: string | null) =>
    owner === null ? "공동" : owner === ctx.userId ? ctx.user.name : ctx.partner?.name ?? "배우자";

  return (
    <div className="grid gap-5">
      <PageHeader title="자산" description="계좌 잔액 = 마지막으로 맞춘 잔액 + 이후 거래" actions={<NewAccountButton isCouple={ctx.isCouple} />} />

      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <Card>
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

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            생활비 통장과 자주 쓰는 카드부터 등록해 보세요. 잔액만 입력하면 돼요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const total = g.items.reduce((s, a) => s + a.balance, 0n);
            const liability = isLiability(g.type);
            return (
              <section key={g.type} className="grid content-start gap-1.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold">{ACCOUNT_TYPE_LABEL[g.type]}</h2>
                  <Money value={liability ? -total : total} className="text-sm text-muted-foreground" />
                </div>
                <ul className="divide-y rounded-xl border">
                  {g.items.map((a) => {
                    const canManage = a.ownerUserId === null || a.ownerUserId === ctx.userId;
                    return (
                      <li key={a.id} className="flex items-center gap-2 py-2 pr-1 pl-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[a.institution, ctx.isCouple ? ownerLabel(a.ownerUserId) : null, ctx.isCouple ? VISIBILITY_LABEL[a.defaultVisibility] : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <Money value={liability ? -a.balance : a.balance} className="text-sm font-semibold" />
                        <AccountMenu
                          account={{
                            id: a.id,
                            name: a.name,
                            type: a.type,
                            institution: a.institution,
                            owner: a.ownerUserId === null ? "joint" : "me",
                            defaultVisibility: a.defaultVisibility,
                            isArchived: a.isArchived,
                          }}
                          balance={a.balance}
                          isCouple={ctx.isCouple}
                          canManage={canManage}
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
    </div>
  );
}
