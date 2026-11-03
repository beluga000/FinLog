"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setAccountVisibility } from "@/features/accounts/actions";
import type { AccountType, Visibility } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";

export interface SharingRow {
  id: string;
  name: string;
  type: AccountType;
  /** 공동 명의면 비공개 불가 */
  joint: boolean;
  visibility: Visibility;
  myTxCount: number;
  /** 계좌 기본값과 다르게 따로 정한 내 기록 — 일괄 변경에서 제외 */
  customTxCount: number;
  registeredByPartner: boolean;
}

/** 공개범위 + 조사: "공유로", "합계만으로", "비공개로" */
const TO_LABEL: Record<Visibility, string> = { SHARED: "공유로", SUMMARY_ONLY: "합계만으로", PRIVATE: "비공개로" };

const LEVELS = ["SHARED", "SUMMARY_ONLY", "PRIVATE"] as const;

/** 내 명의·공동 계좌의 기본 공개범위. 바꿀 때 지난 기록까지 바꿀지 묻는다 */
export function SharingList({ rows, partnerName }: { rows: SharingRow[]; partnerName: string }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<{ row: SharingRow; visibility: Visibility } | null>(null);

  const apply = (row: SharingRow, visibility: Visibility, applyToExisting: boolean) =>
    start(async () => {
      const r = await setAccountVisibility(row.id, { visibility, applyToExisting });
      if (!r.ok) return void toast.error(r.error);
      setAsking(null);
      toast.success(
        applyToExisting && r.data?.updated
          ? `${row.name}: ${TO_LABEL[visibility]} 바꾸고 지난 기록 ${r.data.updated}건도 바꿨어요`
          : `${row.name}: 앞으로 기록하는 거래부터 ${TO_LABEL[visibility]} 저장돼요`,
      );
    });

  const choose = (row: SharingRow, visibility: Visibility) => {
    if (visibility === row.visibility) return;
    if (row.myTxCount - row.customTxCount > 0) setAsking({ row, visibility });
    else apply(row, visibility, false);
  };

  return (
    <>
      <ul className="divide-y rounded-xl border">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{row.name}</span>
                {row.registeredByPartner ? (
                  <Badge variant="outline" className="shrink-0">
                    {partnerName}님이 등록
                  </Badge>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[ACCOUNT_TYPE_LABEL[row.type], row.joint ? "공동" : "내 명의", row.myTxCount ? `내 기록 ${row.myTxCount}건` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={`${row.name} 공개범위`}>
              {LEVELS.map((v) => {
                const disabled = v === "PRIVATE" && row.joint;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={row.visibility === v}
                    disabled={pending || disabled}
                    title={disabled ? "공동 명의 계좌는 비공개로 둘 수 없어요" : VISIBILITY_HINT[v]}
                    onClick={() => choose(row, v)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap",
                      row.visibility === v ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
                      disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                    )}
                  >
                    {VISIBILITY_LABEL[v]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {asking ? `${asking.row.name} → ${VISIBILITY_LABEL[asking.visibility]}` : ""}
            </DialogTitle>
            <DialogDescription>
              {asking ? `${VISIBILITY_HINT[asking.visibility]}. ` : ""}
              이 계좌로 내가 기록한 지난 거래 {asking ? asking.row.myTxCount - asking.row.customTxCount : 0}건과 정기 거래도 함께 바꿀까요?
              {asking?.row.customTxCount ? ` 거래마다 따로 정한 ${asking.row.customTxCount}건은 그대로 둬요.` : ""} {partnerName}님이 기록한 거래는 바뀌지 않아요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={pending} onClick={() => asking && apply(asking.row, asking.visibility, false)}>
              앞으로만
            </Button>
            <Button disabled={pending} onClick={() => asking && apply(asking.row, asking.visibility, true)}>
              지난 기록도 함께
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
