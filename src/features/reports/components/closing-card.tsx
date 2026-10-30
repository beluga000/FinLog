import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/finance/money";
import { parseMonthKey } from "@/lib/finance/period";
import type { MonthlyClosing } from "../closing";

/** 리포트 최상단 — 지난달 결산 + 다음 달 조정 제안 (§4-7, AC-16) */
export function ClosingCard({ closing: c }: { closing: MonthlyClosing }) {
  const { m } = parseMonthKey(c.month);
  const over = c.spendableResult < 0n;
  const savingRatio = c.saving.planned > 0n ? Number(c.saving.actual) / Number(c.saving.planned) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m}월 결산</CardTitle>
        <CardDescription>지난달을 돌아보고 이번 달을 조정해요.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-4">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">쓸 수 있는 돈</dt>
            <dd className={cn("font-semibold", over && "text-critical")}>
              <Money value={over ? -c.spendableResult : c.spendableResult} compact /> {over ? "초과" : "남김"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">목표 저축</dt>
            <dd className="font-semibold">
              <Money value={c.saving.actual} compact />
              {c.saving.planned > 0n ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  / <Money value={c.saving.planned} compact />
                </span>
              ) : null}
            </dd>
            {savingRatio !== null ? (
              <dd className={cn("text-xs", savingRatio >= 1 ? "text-good" : "text-critical")}>
                {savingRatio >= 1 ? "달성" : `${formatPercent(savingRatio, 0)} 달성`}
              </dd>
            ) : null}
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">저축률</dt>
            <dd className="font-semibold tabular">{formatPercent(c.savingsRate, 0)}</dd>
          </div>
          {c.primaryGoal ? (
            <div className="grid gap-0.5">
              <dt className="truncate text-xs text-muted-foreground">{c.primaryGoal.name}</dt>
              <dd className="font-semibold">{c.primaryGoal.pace ?? "잔액 기록 이전"}</dd>
            </div>
          ) : null}
        </dl>

        {c.suggestions.length ? (
          <div className="grid gap-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">이번 달 조정 제안</div>
            <ul className="grid gap-1.5">
              {c.suggestions.map((s) => (
                <li key={s.kind}>
                  <Link href={s.href} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/70">
                    <span className="min-w-0 flex-1">{s.text}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-t pt-3 text-sm text-muted-foreground">지난달은 계획대로 갔어요. 이번 달도 같은 페이스로 가면 돼요.</p>
        )}
      </CardContent>
    </Card>
  );
}
