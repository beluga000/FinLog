import { cn } from "cn";
import { Money } from "@/components/common/money";
import { goalPaceKind, type GoalBlocker } from "@/lib/finance/goals";
import { formatMonthLabel } from "@/lib/finance/period";
import type { GoalView } from "../queries";

const BLOCKER_TEXT: Record<GoalBlocker, string> = {
  priority: "앞 순위에 밀려 배분 0원",
  commit: "확정액이 0원이에요",
  noSaving: "저축 기록이 없어 멈춰 있어요",
};

/**
 * 계획 대비 상태 한 줄 — 색 + 텍스트 (색만으로 의미 전달 금지).
 * 늦어지는 목표는 "N개월 늦어요" 대신 원인(배분 0원)이나 모자란 월 금액으로 말한다.
 * 빨강은 지금 배분으로 닿을 수 없을 때만, 고칠 수 있는 상태는 주황.
 */
export function GoalPace({ goal, className }: { goal: GoalView; className?: string }) {
  const p = goalPaceKind(goal);
  switch (p.kind) {
    case "achieved":
      return <span className={cn("text-good", className)}>달성 완료</span>;
    case "paused":
      return <span className={cn("text-muted-foreground", className)}>일시정지</span>;
    case "ready":
      return <span className={cn("text-good", className)}>지금 모인 돈만으로 닿아요</span>;
    case "onTrack":
      return (
        <span className={cn("text-good", className)}>
          계획대로면 {p.aheadMonths === 0 ? "목표일에" : `${p.aheadMonths}개월 먼저`} 달성
        </span>
      );
    case "blocked":
      return <span className={cn("text-warning", className)}>{BLOCKER_TEXT[p.by]}</span>;
    case "short":
      return (
        <span className={cn("text-warning", className)}>
          월 <Money value={p.gap} compact /> 모자라요
        </span>
      );
    case "stuck":
      return <span className={cn("text-critical", className)}>지금 배분으로는 닿기 어려워요</span>;
  }
}

/** 조정이 필요한 상태인지 — 홈의 [조정하기] 버튼 노출 기준 */
export function needsAdjust(goal: GoalView): boolean {
  const k = goalPaceKind(goal).kind;
  return k === "blocked" || k === "short" || k === "stuck";
}

/** 달성 예상 시점 — 개월 수 대신 연·월로 (244개월보다 2046년이 와닿는다) */
export function GoalEta({ goal, className }: { goal: GoalView; className?: string }) {
  if (!goal.etaMonth || goal.status !== "ACTIVE") return null;
  const label = formatMonthLabel(goal.etaMonth);
  return <span className={cn("text-muted-foreground", className)}>{goal.evaluation.onTrack ? `예상 달성 ${label}` : `지금 속도면 ${label}`}</span>;
}

/** 곧 끝나는 목표라 순위보다 먼저 배분받는 중 */
export function FastTrackBadge({ goal }: { goal: GoalView }) {
  if (!goal.fastTrack || goal.status !== "ACTIVE") return null;
  return (
    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand" title="남은 금액이 저축 가능액 3달 치 이하라 순위보다 먼저 채워요">
      곧 끝나서 먼저 채워요
    </span>
  );
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
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
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
