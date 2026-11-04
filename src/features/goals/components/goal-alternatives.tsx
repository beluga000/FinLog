import Link from "next/link";
import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addMonthsExact } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";
import type { GoalView } from "../queries";
import { ApplyAlternativeButton, RaisePriorityButton } from "./goal-controls";

/**
 * 목표 상세 "이렇게 조정해 보세요" (PROD.MD §4-6).
 * 배정액으로 목표일을 못 맞출 때 대안 (a) 기간 연장 (b) 금액 조정 (c) 수익률 상향 (d) 우선순위 올리기.
 * 배정액이 0이면 대안이 의미가 없어 원인 안내로 바꾼다.
 */
export function GoalAlternativesCard({ goal, today, capacity }: { goal: GoalView; today: DateStr; capacity: number }) {
  const alt = goal.evaluation.alternatives;
  if (!alt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>계획대로 가고 있어요</CardTitle>
          <CardDescription>지금 배분액을 유지하면 목표일 전에 달성해요</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">남는 저축 여력은 다음 우선순위 목표로 배분돼요.</CardContent>
      </Card>
    );
  }

  if (goal.contribution <= 0) {
    const reason =
      goal.contributionSource === "commit" ? "commit" : capacity <= 0 ? "noSaving" : "priority";
    return (
      <Card>
        <CardHeader>
          <CardTitle>이렇게 조정해 보세요</CardTitle>
          <CardDescription>
            {reason === "commit"
              ? "월 납입 확정액이 0원이에요"
              : reason === "noSaving"
                ? "아직 저축 기록이 없어요"
                : "앞 순위 목표가 저축 가능액을 모두 쓰고 있어요"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {reason === "commit" ? (
            <p className="text-muted-foreground">확정액을 0원으로 정해 두어 이 목표엔 저축이 배정되지 않아요. 확정을 해제하면 저축 가능액에서 자동으로 나눠 받아요.</p>
          ) : reason === "noSaving" ? (
            <p className="text-muted-foreground">
              최근 3개월 저축 기록이 없어 대안을 계산할 수 없어요.{" "}
              <Link href="#what-if" className="font-medium text-foreground underline underline-offset-4">
                만약에
              </Link>
              에서 월 저축액을 정해 보세요.
            </p>
          ) : goal.priorityRaise ? (
            <PriorityRaiseRow goal={goal} />
          ) : (
            <p className="text-muted-foreground">
              <Link href="/goals" className="font-medium text-foreground underline underline-offset-4">
                목표 목록
              </Link>
              에서 우선순위를 바꿔 보세요.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const extendTo = alt.extendToMonths !== null ? addMonthsExact(today, alt.extendToMonths) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>이렇게 조정해 보세요</CardTitle>
        <CardDescription>월 {Math.round(goal.contribution / 1e4).toLocaleString("ko-KR")}만원 기준 대안</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            (a) 기간 연장 — {extendTo === null ? "100년 안에 어려워요" : <b>{extendTo.slice(0, 7).replace("-", "년 ")}월</b>}
          </span>
          {extendTo !== null ? <ApplyAlternativeButton id={goal.id} label="적용" change={{ targetDate: extendTo }} /> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            (b) 목표 금액 조정 — <b><Money value={alt.reachableTarget} compact /></b>
          </span>
          {alt.reachableTarget > 0 ? (
            <ApplyAlternativeButton id={goal.id} label="적용" change={{ targetAmount: String(alt.reachableTarget) }} />
          ) : null}
        </div>
        {alt.higherReturn ? (
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                (c) 기대수익률 {(alt.higherReturn.annualReturn * 100).toFixed(1)}% 가정 — 월 <b><Money value={alt.higherReturn.monthly} compact /></b>
              </span>
              <ApplyAlternativeButton id={goal.id} label="적용" change={{ expectedReturn: alt.higherReturn.annualReturn }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {alt.higherReturn.shortfall === 0 ? (
                <span className="text-good">적용하면 지금 배정액으로 달성해요.</span>
              ) : (
                <>
                  적용해도 월 <Money value={alt.higherReturn.shortfall} compact /> 부족해요.
                </>
              )}{" "}
              수익률이 높을수록 손실 가능성(변동성)도 커져요.
            </p>
          </div>
        ) : null}
        {goal.priorityRaise ? <PriorityRaiseRow goal={goal} labeled /> : null}
      </CardContent>
    </Card>
  );
}

/** 대안 (d) — 바로 위 진행 중 목표 위로 한 칸 올렸을 때 배정 변화 */
function PriorityRaiseRow({ goal, labeled = false }: { goal: GoalView; labeled?: boolean }) {
  const r = goal.priorityRaise!;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {labeled ? "(d) " : ""}우선순위 한 칸 올리기 — 월 <Money value={goal.contribution} compact /> → <b><Money value={r.allocated} compact /></b> 배정
        </span>
        <RaisePriorityButton id={goal.id} />
      </div>
      <p className="text-xs text-muted-foreground">
        {r.shortfall === 0 ? (
          <span className="text-good">올리면 목표일에 맞출 수 있어요.</span>
        ) : (
          <>
            올려도 월 <Money value={r.shortfall} compact /> 부족해요.
          </>
        )}{" "}
        {r.displaced.map((d, i) => (
          <span key={d.id}>
            {i > 0 ? " " : ""}
            대신 {d.name}
            {d.committed ? (
              <> 목표가 확정액보다 월 <Money value={d.loss} compact /> 모자라게 돼요.</>
            ) : (
              <> 배정이 월 <Money value={d.loss} compact /> 줄어요.</>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
