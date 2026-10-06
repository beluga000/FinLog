import Link from "next/link";
import { Money } from "@/components/common/money";
import type { GoalView } from "../queries";
import { GoalPace, GoalProgressBar, RequiredLine } from "./goal-status";

export function GoalMiniList({ goals }: { goals: GoalView[] }) {
  if (!goals.length) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 목표가 없어요. <Link href="/goals" className="font-medium text-foreground underline">목표 만들기</Link>
      </p>
    );
  }
  return (
    <ul className="grid gap-4">
      {goals.map((g) => (
        <li key={g.id}>
          <Link href={`/goals/${g.id}`} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                <Money value={g.current} compact /> / <Money value={g.targetAmount} compact />
              </span>
            </div>
            <GoalProgressBar goal={g} />
            <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
              <GoalPace goal={g} />
              <RequiredLine goal={g} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
