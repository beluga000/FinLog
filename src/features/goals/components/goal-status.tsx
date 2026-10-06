import { cn } from "cn";
import { Money } from "@/components/common/money";
import type { GoalView } from "../queries";

/** 계획 대비 상태 한 줄 — 색 + 텍스트 (색만으로 의미 전달 금지) */
export function GoalPace({ goal, className }: { goal: GoalView; className?: string }) {
  const e = goal.evaluation;
  if (goal.status === "ACHIEVED") return <span className={cn("text-good", className)}>달성 완료</span>;
  if (goal.status === "PAUSED") return <span className={cn("text-muted-foreground", className)}>일시정지</span>;
  if (e.required.alreadyAchievable) return <span className={cn("text-good", className)}>현재 자산만으로 달성 가능</span>;
  if (e.aheadMonths === null)
    return <span className={cn("text-critical", className)}>지금 납입액으로는 달성이 어려워요</span>;
  if (e.aheadMonths >= 0)
    return (
      <span className={cn("text-good", className)}>
        계획대로면 {e.aheadMonths === 0 ? "목표일에" : `${e.aheadMonths}개월 먼저`} 달성
      </span>
    );
  return <span className={cn("text-critical", className)}>목표일보다 {-e.aheadMonths}개월 늦어요</span>;
}

export function GoalProgressBar({ goal }: { goal: GoalView }) {
  const pct = Math.min(100, Math.max(0, goal.evaluation.progress * 100));
  return (
    <div
      className="h-2 rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${goal.name} 진척률`}
    >
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--chart-1)" }} />
    </div>
  );
}

export function RequiredLine({ goal }: { goal: GoalView }) {
  const e = goal.evaluation;
  if (e.required.alreadyAchievable || goal.status !== "ACTIVE") return null;
  return (
    <span>
      월 <Money value={e.required.monthly} compact /> 필요
    </span>
  );
}
