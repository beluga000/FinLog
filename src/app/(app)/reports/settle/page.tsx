import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettleButton, SplitMethodPicker } from "@/features/reports/components/settlement-controls";
import { getSettlement } from "@/features/reports/settlement";
import { requireHousehold } from "@/lib/db/context";
import { getMonthKey, parseMonthKey, shiftMonth, todayKST } from "@/lib/finance/period";

export const metadata = { title: "정산" };

/** 부부 정산 — 각자 낸 공동 지출을 나누는 방식대로 맞춘다 (src/lib/finance/settlement.ts) */
export default async function SettlePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireHousehold();
  const sp = await searchParams;
  const { monthStartDay } = ctx.household;
  const thisMonth = getMonthKey(todayKST(), monthStartDay);
  // 기본은 지난달 (이번 달은 아직 진행 중)
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : shiftMonth(thisMonth, -1);
  const s = await getSettlement(ctx, month);
  const back = (
    <Link href="/reports" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" /> 리포트
    </Link>
  );

  if (!s) {
    return (
      <div className="grid gap-5">
        {back}
        <PageHeader title="정산" />
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
          배우자와 연결하면 각자 낸 생활비를 맞춰 볼 수 있어요. <Link href="/settings/couple" className="underline">부부 설정</Link>
        </p>
      </div>
    );
  }

  const name = (id: string) => (id === ctx.userId ? "나" : s.members.find((m) => m.id === id)?.name ?? "배우자");
  const sub = (id: string) => (id === ctx.userId ? "내가" : `${name(id)}님이`);
  const [first, second] = s.members;
  const r = s.result;
  const stale = s.done && (!r.transfer || r.transfer.amount !== s.done.amount || r.transfer.from !== s.done.from);
  const { m } = parseMonthKey(month);

  return (
    <div className="grid gap-5">
      {back}
      <PageHeader
        title="정산"
        description="각자 낸 생활비(비공개가 아닌 지출)를 정한 비율로 맞춰요."
        actions={<MonthNav month={month} monthStartDay={monthStartDay} basePath="/reports/settle" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m}월 정산</CardTitle>
          <CardDescription>
            공동 지출 {s.count}건 · 공동 명의 계좌로 낸 <Money value={r.jointPaid} compact />은 이미 함께 낸 돈이라 빼요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="rounded-xl bg-muted/60 px-4 py-4 text-center">
            {r.transfer ? (
              <p className="text-lg font-semibold">
                {sub(r.transfer.from)} {r.transfer.to === ctx.userId ? "나에게" : `${name(r.transfer.to)}님에게`}{" "}
                <Money value={r.transfer.amount} className="text-primary" /> 보내면 돼요
              </p>
            ) : (
              <p className="text-lg font-semibold">맞출 금액이 없어요</p>
            )}
            {s.done ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {s.done.settledAt ? new Date(s.done.settledAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : ""} 정산 완료 ·{" "}
                <Money value={s.done.amount} />
                {stale ? " — 그 뒤 기록이 바뀌어 금액이 달라졌어요" : ""}
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 font-medium" />
                  <th className="text-right font-medium">낸 돈</th>
                  <th className="text-right font-medium">몫</th>
                  <th className="text-right font-medium">차이</th>
                </tr>
              </thead>
              <tbody>
                {s.members.map((mem, i) => {
                  const bp = i === 0 ? r.basisPointsA : 10_000 - r.basisPointsA;
                  return (
                    <tr key={mem.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        {name(mem.id)} <span className="text-xs text-muted-foreground tabular">{Math.round(bp / 10) / 10}%</span>
                      </td>
                      <td className="text-right">
                        <Money value={r.paid[mem.id]} />
                      </td>
                      <td className="text-right">
                        <Money value={r.share[mem.id]} />
                      </td>
                      <td className="text-right">
                        <Money value={r.paid[mem.id] - r.share[mem.id]} sign />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {r.transfer || s.done ? (
            <div className="flex flex-wrap items-center gap-2">
              <SettleButton month={month} done={!!s.done} />
              {!s.done ? <span className="text-xs text-muted-foreground">실제로 보낸 뒤 눌러 두면 다음에 헷갈리지 않아요.</span> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>나누는 방식</CardTitle>
          <CardDescription>
            {r.incomeFallback ? "이 달 공개된 수입 기록이 없어 반반으로 계산했어요. " : ""}
            각자 쓴 용돈처럼 나누지 않을 지출은 기록할 때 &lsquo;비공개&rsquo;로 두세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SplitMethodPicker method={s.setting.method} percentFirst={s.setting.percentFirst} firstName={name(first.id)} secondName={name(second.id)} />
        </CardContent>
      </Card>
    </div>
  );
}
