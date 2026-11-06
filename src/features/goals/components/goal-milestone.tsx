"use client";

import { useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MILESTONES } from "@/lib/finance/goals";
import { dismissGoalMilestone, setGoalStatus } from "../actions";

const HEADLINE: Record<number, string> = {
  25: "4분의 1 왔어요",
  50: "절반 왔어요",
  75: "4분의 3 왔어요",
  100: "목표 금액을 다 모았어요",
};

export interface MilestoneValue {
  id: string;
  name: string;
  milestone: number;
  /** 0~1+ */
  progress: number;
  /** 양수 = 목표일보다 빠름 */
  aheadMonths: number | null;
  alreadyAchievable: boolean;
}

/**
 * 홈 진행률 알림 — 25·50·75·100%를 넘으면 한 번 띄우고, 닫으면 그 단계는 다시 띄우지 않는다.
 * 홈은 모인 돈을 가려 두므로 금액 없이 진척률만 보여 준다.
 */
export function GoalMilestoneCard({ goal }: { goal: MilestoneValue }) {
  const [pending, start] = useTransition();
  const pct = Math.min(100, Math.max(0, goal.progress * 100));
  const pace =
    goal.milestone === 100
      ? "달성으로 바꾸면 이 목표에 배분하던 저축이 다른 목표로 넘어가요."
      : goal.alreadyAchievable
        ? "지금 모인 돈만 굴려도 목표일까지 닿아요."
        : goal.aheadMonths === null
          ? null
          : goal.aheadMonths > 0
            ? `계획보다 ${goal.aheadMonths}개월 빨라요.`
            : goal.aheadMonths < 0
              ? `계획보다 ${-goal.aheadMonths}개월 늦어요.`
              : "계획대로 가고 있어요.";

  const dismiss = () =>
    start(async () => {
      const r = await dismissGoalMilestone(goal.id, goal.milestone);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <section className="grid gap-3 rounded-xl bg-brand-soft p-4" aria-label="목표 진행 알림">
      <div className="flex items-start gap-2">
        <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1 font-semibold hover:underline">
          {goal.name} {HEADLINE[goal.milestone]}
        </Link>
        <Button variant="ghost" size="icon-xs" aria-label="알림 닫기" disabled={pending} onClick={dismiss}>
          <X />
        </Button>
      </div>
      <div className="grid gap-1.5">
        <div className="h-2 rounded-full bg-background/70" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name} 진척률`}>
          <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
        </div>
        <div className="flex justify-between text-[11px] tabular text-muted-foreground">
          {MILESTONES.map((m) => (
            <span key={m} className={m <= goal.milestone ? "font-semibold text-brand" : undefined}>
              {m}%
            </span>
          ))}
        </div>
      </div>
      {pace ? <p className="text-sm text-muted-foreground">{pace}</p> : null}
      {goal.milestone === 100 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setGoalStatus(goal.id, "ACHIEVED");
                if (!r.ok) return void toast.error(r.error ?? "실패했어요");
                await dismissGoalMilestone(goal.id, 100);
                toast.success("축하해요! 달성 처리했어요");
              })
            }
          >
            달성으로 바꾸기
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={dismiss}>
            나중에
          </Button>
        </div>
      ) : null}
    </section>
  );
}
