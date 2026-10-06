"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AccountType } from "@/lib/finance/types";
import { applyGoalAlternative, deleteGoal, moveGoalPriority, setGoalCommit, setGoalStatus } from "../actions";
import { GoalFormDialog, type GoalFormValue } from "./goal-form";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast.error(r.error ?? "실패했어요");
      else if (success) toast.success(success);
    });
  return { pending, run };
}

export function PriorityButtons({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col">
      <Button variant="ghost" size="icon-xs" aria-label="우선순위 올리기" disabled={first || pending} onClick={() => run(() => moveGoalPriority(id, "up"))}>
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="우선순위 내리기" disabled={last || pending} onClick={() => run(() => moveGoalPriority(id, "down"))}>
        <ArrowDown />
      </Button>
    </div>
  );
}

export function CommitButton({ id, monthly, committed }: { id: string; monthly: number; committed: boolean }) {
  const { pending, run } = useAction();
  if (committed) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => setGoalCommit(id, null), "확정을 해제했어요")}>
        확정 해제 (자동 배분으로)
      </Button>
    );
  }
  return (
    <Button disabled={pending || monthly <= 0} onClick={() => run(() => setGoalCommit(id, String(monthly)), "월 납입액을 확정했어요")}>
      이 금액으로 확정
    </Button>
  );
}

export function ApplyAlternativeButton({
  id,
  change,
  label,
}: {
  id: string;
  change: { targetDate?: string; targetAmount?: string; expectedReturn?: number };
  label: string;
}) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyGoalAlternative(id, change), "목표를 조정했어요")}>
      {label}
    </Button>
  );
}

export function GoalMenu({
  goal,
  accounts,
}: {
  goal: GoalFormValue & { id: string; status: "ACTIVE" | "ACHIEVED" | "PAUSED" };
  accounts: { id: string; name: string; type: AccountType }[];
}) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setEditing(true)}>수정</Button>
      {goal.status === "ACTIVE" ? (
        <>
          <Button variant="outline" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "ACHIEVED"), "축하해요! 달성 처리했어요")}>
            달성 처리
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "PAUSED"))}>
            일시정지
          </Button>
        </>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "ACTIVE"))}>
          다시 진행
        </Button>
      )}
      {confirmDelete ? (
        <span className="inline-flex items-center gap-1">
          <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteGoal(goal.id))}>정말 삭제</Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
        </span>
      ) : (
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>삭제</Button>
      )}
      <GoalFormDialog open={editing} onOpenChange={setEditing} accounts={accounts} initial={goal} />
    </div>
  );
}
