import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getAccountOverview, type AccountWithBalance } from "@/features/accounts/queries";
import { AccountMenu, NewAccountButton, type AccountFormEnv } from "@/features/accounts/components/account-dialogs";
import { ownerChoiceOf, PAYMENT_SOURCE_TYPES } from "@/features/accounts/rules";
import { NewRecurringButton, RecurringList, type RecurringRowView } from "@/features/ledger/components/recurring-controls";
import { getAccounts, getCategories, getRecurringRules } from "@/features/ledger/queries";
import { scheduleOf } from "@/features/ledger/recurring-view";
import { requireHousehold } from "@/lib/db/context";
import { SAVING_DESTINATION_TYPES } from "@/lib/finance/balance";
import { formatKRW } from "@/lib/finance/money";
import { todayKST } from "@/lib/finance/period";
import { estimateMaturity, termProgress, type MaturityEstimate } from "@/lib/finance/savings";
import type { DateStr } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";

export const metadata = { title: "고정 저축" };

const GROUPS = [{ key: "SAVING" as const, label: "매달 자동이체" }];

const dotted = (d: DateStr) => d.replaceAll("-", ".");
const daysUntil = (from: DateStr, to: DateStr) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const pct = (rate: number) => `${Math.round(rate * 100_000) / 1_000}%`;

type Rule = Awaited<ReturnType<typeof getRecurringRules>>[number];

interface SavingsItem {
  account: AccountWithBalance | null;
  rows: RecurringRowView[];
  monthly: bigint;
  estimate: MaturityEstimate | null;
  progress: number | null;
  dDay: number | null;
}

export default async function SavingsPage() {
  const ctx = await requireHousehold();
  const today = todayKST();
  const [{ accounts }, allVisible, categories, rules] = await Promise.all([
    getAccountOverview(ctx, "us", { today, monthStartDay: ctx.household.monthStartDay, trendMonths: 1 }),
    getAccounts(ctx, "us"),
    getCategories(ctx),
    getRecurringRules(ctx),
  ]);
  const nameById = new Map(allVisible.map((a) => [a.id, a.name]));
  const memberName = new Map(ctx.members.map((m) => [m.id, m.name]));

  const savingRules = rules.filter((r) => r.template.type === "SAVE_INVEST");
  const toRow = (r: Rule): RecurringRowView => ({
    rule: {
      id: r.id,
      name: r.name,
      template: r.template,
      dayOfMonth: r.dayOfMonth,
      businessDayAdjust: r.businessDayAdjust,
      startDate: r.startDate,
      endDate: r.endDate,
    },
    group: "SAVING",
    detail: r.template.fromAccountId ? `${nameById.get(r.template.fromAccountId) ?? "?"}에서` : "",
    schedule: scheduleOf(r, today),
    lastRunOn: r.lastRunOn,
    isActive: r.isActive,
    isMine: r.createdByUserId === ctx.userId,
    ownerName: r.createdByUserId === ctx.userId ? "나" : memberName.get(r.createdByUserId) ?? "배우자",
  });

  // 저축 통장 전부 + 정기 저축이 들어가는 다른 계좌(증권·연금 등)
  const destIds = new Set(savingRules.map((r) => r.template.toAccountId).filter((id): id is string => !!id));
  const listed = accounts.filter((a) => a.type === "SAVINGS" || (destIds.has(a.id) && SAVING_DESTINATION_TYPES.includes(a.type)));
  const listedIds = new Set(listed.map((a) => a.id));

  const items: SavingsItem[] = listed.map((account) => {
    const own = savingRules.filter((r) => r.template.toAccountId === account.id);
    const rows = own.map(toRow);
    const live = own.filter((r, i) => rows[i].schedule.status === "active");
    const monthly = live.reduce((s, r) => s + BigInt(r.template.amount), 0n);
    const maturity = account.type === "SAVINGS" ? account.maturityDate : null;
    return {
      account,
      rows,
      monthly,
      estimate: maturity
        ? estimateMaturity({
            balance: account.balance,
            deposits: live.map((r) => ({ amount: BigInt(r.template.amount), schedule: r, lastRunOn: r.lastRunOn })),
            annualRate: account.interestRate,
            openedOn: account.openedOn,
            maturityDate: maturity,
            today,
          })
        : null,
      progress: termProgress(account.openedOn, maturity, today),
      dDay: maturity ? daysUntil(today, maturity) : null,
    };
  });
  // 만기 가까운 순 → 만기 없는 계좌는 월 저축 큰 순
  items.sort((a, b) => {
    if (a.dDay !== null && b.dDay !== null) return a.dDay - b.dDay;
    if (a.dDay !== null) return -1;
    if (b.dDay !== null) return 1;
    return Number(b.monthly - a.monthly);
  });
  const orphanRules = savingRules.filter((r) => !r.template.toAccountId || !listedIds.has(r.template.toAccountId));
  if (orphanRules.length) {
    const rows = orphanRules.map(toRow);
    items.push({
      account: null,
      rows,
      monthly: orphanRules.reduce((s, r, i) => (rows[i].schedule.status === "active" ? s + BigInt(r.template.amount) : s), 0n),
      estimate: null,
      progress: null,
      dDay: null,
    });
  }

  const monthlyTotal = items.reduce((s, i) => s + i.monthly, 0n);
  const balanceTotal = listed.reduce((s, a) => s + a.balance, 0n);
  const activeCount = items.reduce((s, i) => s + i.rows.filter((r) => r.schedule.status === "active").length, 0);
  const nextMaturity = items.find((i) => i.dDay !== null && i.dDay >= 0) ?? null;
  // 만기가 지났는데 자동이체가 계속 기록되는 계좌
  const overdue = items.filter((i) => i.dDay !== null && i.dDay < 0 && i.monthly > 0n);

  const formEnv = { accounts: allVisible, categories, viewerId: ctx.userId, isCouple: ctx.isCouple };
  const accountEnv: AccountFormEnv = {
    isCouple: ctx.isCouple,
    partnerName: ctx.partner?.name ?? null,
    paymentOptions: allVisible.filter((a) => PAYMENT_SOURCE_TYPES.includes(a.type)).map((a) => ({ id: a.id, name: a.name })),
  };
  // 새 자동이체의 출금 계좌 기본값: 내 명의·공동 입출금 통장
  const defaultFrom =
    allVisible.find((a) => a.type === "CHECKING" && a.ownerUserId === ctx.userId) ??
    allVisible.find((a) => a.type === "CHECKING" && a.ownerUserId === null) ??
    allVisible.find((a) => a.type === "CHECKING") ??
    null;
  const draftFor = (toAccountId: string | null) => ({
    type: "SAVE_INVEST" as const,
    amount: 0n,
    fromAccountId: defaultFrom?.id ?? null,
    toAccountId,
  });
  const ownerLabel = (owner: string | null) =>
    owner === null ? "공동" : owner === ctx.userId ? ctx.user.name : ctx.partner?.name ?? "배우자";

  return (
    <div className="grid gap-5">
      <Link href="/assets" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 자산
      </Link>
      <PageHeader
        title="고정 저축"
        description="매달 자동으로 모으는 돈과 예적금 만기를 한곳에서 봐요. 고정 저축은 홈의 '쓸 수 있는 돈'에서 미리 빠져요."
        actions={
          <>
            <NewAccountButton env={accountEnv} defaultType="SAVINGS" label="적금 계좌 추가" variant="outline" />
            <NewRecurringButton {...formEnv} label="고정 저축 추가" defaultType="SAVE_INVEST" draft={draftFor(listed.find((a) => a.type === "SAVINGS")?.id ?? null)} />
          </>
        }
      />

      {items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">아직 고정 저축이 없어요</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            적금 계좌를 추가하고 매달 들어가는 자동이체를 등록하면, 그날 자동으로 기록되고 만기 예상액까지 계산해 드려요.
          </p>
          <NewAccountButton env={accountEnv} defaultType="SAVINGS" label="적금 계좌 추가" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">매달 고정 저축</div>
                  <div className="text-3xl font-black">
                    <Money value={monthlyTotal} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">진행 중 {activeCount}건</div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">모은 돈 (계좌 잔액)</dt>
                  <dd className="truncate font-semibold">
                    <Money value={balanceTotal} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">다음 만기</dt>
                  <dd className="truncate font-semibold">
                    {nextMaturity?.account ? (
                      <>
                        {nextMaturity.account.name} · {nextMaturity.dDay === 0 ? "오늘" : `D-${nextMaturity.dDay}`}
                      </>
                    ) : (
                      <span className="font-normal text-muted-foreground">만기일을 넣은 계좌가 없어요</span>
                    )}
                  </dd>
                </div>
              </dl>
              {overdue.length ? (
                <p className="text-xs text-critical">
                  {overdue.map((i) => i.account?.name).join(", ")} 만기가 지났는데 자동이체가 계속 기록돼요. 해지했다면 자동이체를 중지하거나 종료일을 넣어 주세요.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {items.map((item) => {
              const a = item.account;
              const e = item.estimate;
              return (
                <Card key={a?.id ?? "none"}>
                  <CardContent className="grid gap-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-semibold">{a ? a.name : "계좌 미지정"}</h2>
                        <p className="truncate text-xs text-muted-foreground">
                          {a
                            ? [
                                ACCOUNT_TYPE_LABEL[a.type],
                                a.institution,
                                a.interestRate !== null && a.type === "SAVINGS" ? `연 ${pct(a.interestRate)}` : null,
                                ctx.isCouple ? ownerLabel(a.ownerUserId) : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "도착 계좌가 없거나 보관된 계좌로 들어가는 저축이에요."}
                        </p>
                      </div>
                      {a ? (
                        <>
                          <div className="grid justify-items-end leading-tight">
                            <Money value={a.balance} className="font-semibold" />
                            <span className="text-xs text-muted-foreground">현재 잔액</span>
                          </div>
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
                              isArchived: a.isArchived,
                            }}
                            balance={a.balance}
                            env={accountEnv}
                          />
                        </>
                      ) : null}
                    </div>

                    {a?.maturityDate && e ? (
                      <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span>
                            {a.openedOn ? `${dotted(a.openedOn)} ~ ` : ""}
                            {dotted(a.maturityDate)} 만기
                          </span>
                          <span className={item.dDay !== null && item.dDay < 0 ? "font-semibold text-critical" : "font-semibold"}>
                            {item.dDay === null ? null : item.dDay < 0 ? "만기 지남" : item.dDay === 0 ? "오늘 만기" : `D-${item.dDay}`}
                          </span>
                        </div>
                        {item.progress !== null ? (
                          <div
                            className="h-2 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-label="가입 기간 진행률"
                            aria-valuenow={Math.round(item.progress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div className="h-full rounded-full" style={{ width: `${item.progress * 100}%`, background: "var(--chart-3)" }} />
                          </div>
                        ) : null}
                        {item.dDay !== null && item.dDay >= 0 ? (
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="text-xs text-muted-foreground">
                              {a.interestRate === null
                                ? "금리를 넣으면 이자까지 계산해 드려요"
                                : `원금 ${formatKRW(e.principal)} + 이자 ${formatKRW(e.interest)} − 세금 ${formatKRW(e.tax)}`}
                              {e.remainingCount > 0 ? ` · 남은 납입 ${e.remainingCount}회` : ""}
                            </span>
                            <span className="text-sm">
                              만기 예상 <Money value={e.afterTax} className="font-bold" />
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : a?.type === "SAVINGS" ? (
                      <p className="text-xs text-muted-foreground">⋯ 메뉴의 수정에서 만기일과 금리를 넣으면 만기까지 남은 기간과 예상 수령액을 보여 드려요.</p>
                    ) : null}

                    {item.rows.length ? (
                      <RecurringList
                        rows={item.rows}
                        groups={GROUPS}
                        isCouple={ctx.isCouple}
                        partnerName={ctx.partner?.name ?? null}
                        formEnv={formEnv}
                        showFootnote={false}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">매달 들어가는 자동이체가 없어요.</p>
                    )}

                    {a ? (
                      <div>
                        <NewRecurringButton {...formEnv} label="자동이체 추가" defaultType="SAVE_INVEST" draft={draftFor(a.id)} variant="outline" size="sm" />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="px-1 text-xs text-muted-foreground">
            만기 예상액은 단리, 이자소득세 15.4% 기준 추정이에요. 비과세·우대금리 상품은 실제 수령액이 더 많을 수 있어요.
            {ctx.isCouple ? ` ${ctx.partner?.name ?? "배우자"}님이 등록한 자동이체는 등록한 사람만 수정·중지할 수 있어요.` : ""}
          </p>
        </>
      )}
    </div>
  );
}
