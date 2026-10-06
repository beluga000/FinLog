"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteRecurringRule, setRecurringRuleActive } from "../actions";
import type { CategoryRow } from "../queries";
import { TxFormDialog, type AccountOption } from "./tx-form";

export function NewRecurringButton(props: {
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> 정기 거래 추가
      </Button>
      <TxFormDialog open={open} onOpenChange={setOpen} mode="recurring" defaultType="INCOME" {...props} />
    </>
  );
}

export function RecurringRuleControls({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else toast.success(msg);
    });
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setRecurringRuleActive(id, !isActive), isActive ? "중지했어요" : "다시 시작했어요")}>
        {isActive ? "중지" : "재개"}
      </Button>
      {confirm ? (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteRecurringRule(id), "삭제했어요 (이미 생성된 거래는 남아요)")}>
          정말 삭제
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
          삭제
        </Button>
      )}
    </div>
  );
}
