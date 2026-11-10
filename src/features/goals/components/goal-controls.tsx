"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyGoalAlternative, deleteGoal, moveGoalPriority, setGoalCommit, setGoalStatus } from "../actions";
import type { GoalClaims } from "../queries";
import { GoalFormDialog, type GoalAccount, type GoalFormValue } from "./goal-form";

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

/** 대안 (d) — 바로 위 진행 중 목표 위로 한 칸 */
export function RaisePriorityButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moveGoalPriority(id, "up", { overActive: true }), "우선순위를 올렸어요")}>
      올리기
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

/** 목표 관리 — 제목 옆 "⋯" 메뉴 (수정·달성 처리·일시정지/다시 진행·삭제). 자주 쓰지 않아 화면에 늘어놓지 않는다 */
export function GoalMenu({
  goal,
  accounts,
  netWorth,
  claims,
}: {
  goal: GoalFormValue & { id: string; status: "ACTIVE" | "ACHIEVED" | "PAUSED" };
  accounts: GoalAccount[];
  netWorth?: number;
  claims?: GoalClaims;
}) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="목표 관리" disabled={pending} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> 수정
          </DropdownMenuItem>
          {goal.status === "ACTIVE" ? (
            <>
              <DropdownMenuItem onClick={() => run(() => setGoalStatus(goal.id, "ACHIEVED"), "축하해요! 달성 처리했어요")}>
                <Check /> 달성 처리
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(() => setGoalStatus(goal.id, "PAUSED"), "일시정지했어요")}>
                <Pause /> 일시정지
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => run(() => setGoalStatus(goal.id, "ACTIVE"), "다시 진행해요")}>
              <Play /> 다시 진행
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>&lsquo;{goal.name}&rsquo; 삭제</DialogTitle>
            <DialogDescription>
              목표와 계획이 지워져요. 연결 계좌와 가계부 기록은 그대로 남아요. 잠시 멈추려면 삭제 대신 일시정지를 쓰세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
              취소
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteGoal(goal.id))}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GoalFormDialog open={editing} onOpenChange={setEditing} accounts={accounts} netWorth={netWorth} claims={claims} initial={goal} />
    </>
  );
}
