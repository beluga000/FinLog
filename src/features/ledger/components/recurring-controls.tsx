"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { DateStr, TxType } from "@/lib/finance/types";
import { deleteRecurringRule, setRecurringRuleActive } from "../actions";
import type { CategoryRow } from "../queries";
import type { RecurringGroup, RuleSchedule } from "../recurring-view";
import { TxFormDialog, type AccountOption, type RecurringRuleEdit, type TxDraft } from "./tx-form";

interface FormEnv {
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
}

export interface RecurringRowView {
  rule: RecurringRuleEdit;
  group: RecurringGroup;
  /** 분류 · 계좌 */
  detail: string;
  schedule: RuleSchedule;
  lastRunOn: DateStr | null;
  isActive: boolean;
  /** 내가 등록한 규칙만 수정·중지·삭제 가능 */
  isMine: boolean;
  ownerName: string;
}

export function NewRecurringButton({
  label = "정기 거래 추가",
  defaultType = "INCOME",
  draft,
  variant,
  size,
  ...env
}: FormEnv & {
  label?: string;
  defaultType?: TxType;
  /** 미리 채울 내용 (예: 이 적금으로 들어가는 저축) */
  draft?: TxDraft;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant={variant} size={size}>
        <Plus /> {label}
      </Button>
      <TxFormDialog open={open} onOpenChange={setOpen} mode="recurring" defaultType={defaultType} draft={draft} {...env} />
    </>
  );
}

const ADJUST_LABEL = { NONE: null, PREV: "주말이면 앞당김", NEXT: "주말이면 미룸" } as const;
const GROUP_COLOR: Record<RecurringGroup, string> = {
  INCOME: "var(--chart-1)",
  EXPENSE: "var(--chart-2)",
  SAVING: "var(--chart-3)",
  TRANSFER: "var(--muted-foreground)",
};

const mmdd = (d: DateStr) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const dayLabel = (n: number) => (n === 0 ? "말일" : `${n}일`);
const dDayLabel = (n: number) => (n === 0 ? "오늘" : n === 1 ? "내일" : `D-${n}`);

export function RecurringList({
  rows,
  groups,
  isCouple,
  partnerName,
  formEnv,
  showFootnote = true,
}: {
  rows: RecurringRowView[];
  groups: { key: RecurringGroup; label: string }[];
  isCouple: boolean;
  partnerName: string | null;
  formEnv: FormEnv;
  /** 배우자 규칙 안내 문구 (한 화면에 목록이 여러 개면 한 번만) */
  showFootnote?: boolean;
}) {
  // 닫히는 애니메이션 동안 제목이 "추가"로 바뀌지 않게 대상과 열림 상태를 따로 둔다
  const [editing, setEditing] = useState<RecurringRuleEdit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecurringRowView | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      after?.();
    });

  const active = rows.filter((r) => r.schedule.status === "active");
  const inactive = rows.filter((r) => r.schedule.status !== "active");
  // 진행 중: 다음 생성일이 가까운 순
  const byNext = (a: RecurringRowView, b: RecurringRowView) => (a.schedule.next ?? "").localeCompare(b.schedule.next ?? "");

  const rowProps = {
    pending,
    onEdit: (r: RecurringRowView) => {
      setEditing(r.rule);
      setEditOpen(true);
    },
    onToggle: (r: RecurringRowView) =>
      run(() => setRecurringRuleActive(r.rule.id, !r.isActive), r.isActive ? "중지했어요" : "다시 시작했어요"),
    onDelete: (r: RecurringRowView) => setDeleting(r),
    showOwner: isCouple,
  };

  return (
    <div className="grid gap-4">
      {groups.map((g) => {
        const items = active.filter((r) => r.group === g.key).sort(byNext);
        if (!items.length) return null;
        const total = items.reduce((s, r) => s + BigInt(r.rule.template.amount), 0n);
        return (
          <section key={g.key} aria-labelledby={`grp-${g.key}`} className="grid gap-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 id={`grp-${g.key}`} className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-2 rounded-full" style={{ background: GROUP_COLOR[g.key] }} aria-hidden />
                {g.label}
                <span className="font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <span className="text-sm text-muted-foreground">
                월 <Money value={total} className="font-semibold text-foreground" />
              </span>
            </div>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {items.map((r) => (
                <RuleRow key={r.rule.id} row={r} {...rowProps} />
              ))}
            </ul>
          </section>
        );
      })}

      {inactive.length ? (
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            중지·종료된 정기 거래 <span className="font-normal text-muted-foreground">{inactive.length}건 · 합계에서 제외</span>
          </summary>
          <ul className="divide-y border-t">
            {inactive.map((r) => (
              <RuleRow key={r.rule.id} row={r} {...rowProps} />
            ))}
          </ul>
        </details>
      ) : null}

      {showFootnote && isCouple && rows.some((r) => !r.isMine) ? (
        <p className="px-1 text-xs text-muted-foreground">
          {partnerName ?? "배우자"}님이 등록한 정기 거래는 등록한 사람만 수정·중지할 수 있어요. 비공개로 등록한 것은 보이지 않아요.
        </p>
      ) : null}

      <TxFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="recurring"
        rule={editing}
        {...formEnv}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>&lsquo;{deleting?.rule.name}&rsquo; 삭제</DialogTitle>
            <DialogDescription>
              앞으로 자동 기록되지 않아요. 이미 기록된 거래는 가계부에 그대로 남아요. 잠시 멈추려면 삭제 대신 중지를 쓰세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => deleting && run(() => deleteRecurringRule(deleting.rule.id), "삭제했어요", () => setDeleting(null))}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleRow({
  row,
  pending,
  onEdit,
  onToggle,
  onDelete,
  showOwner,
}: {
  row: RecurringRowView;
  pending: boolean;
  onEdit: (r: RecurringRowView) => void;
  onToggle: (r: RecurringRowView) => void;
  onDelete: (r: RecurringRowView) => void;
  showOwner: boolean;
}) {
  const { rule, schedule } = row;
  const t = rule.template;
  const adjust = ADJUST_LABEL[rule.businessDayAdjust];
  const statusText =
    schedule.status === "paused" ? "중지됨" : schedule.status === "ended" ? (rule.endDate ? `${mmdd(rule.endDate)} 종료` : "종료") : null;

  const body = (
    <>
      <div className="grid w-12 shrink-0 justify-items-center rounded-lg bg-muted py-1.5 leading-tight">
        <span className="text-[10px] text-muted-foreground">매월</span>
        <span className="text-sm font-bold tabular">{dayLabel(rule.dayOfMonth)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{rule.name}</span>
          {/* 부부 가구: 배우자가 등록한 규칙에만 이름 배지 (내 규칙은 표시 없음) */}
          {showOwner && !row.isMine ? (
            <Badge variant="outline" className="shrink-0">
              {row.ownerName}
            </Badge>
          ) : null}
          {t.visibility === "PRIVATE" ? (
            <Badge variant="outline" className="shrink-0">
              비공개
            </Badge>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[row.detail, adjust, row.lastRunOn ? `최근 ${mmdd(row.lastRunOn)}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="grid shrink-0 justify-items-end leading-tight">
        <Money value={BigInt(t.amount)} className="text-sm font-semibold" />
        {schedule.next ? (
          <span className={cn("text-xs tabular", schedule.dDay !== null && schedule.dDay <= 3 ? "font-medium text-foreground" : "text-muted-foreground")}>
            {mmdd(schedule.next)} · {dDayLabel(schedule.dDay ?? 0)}
          </span>
        ) : statusText ? (
          <span className="text-xs text-muted-foreground">{statusText}</span>
        ) : null}
      </div>
    </>
  );

  return (
    <li className={cn("flex items-center gap-1 pr-1", schedule.status !== "active" && "opacity-60")}>
      {row.isMine ? (
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
          aria-label={`${rule.name} 수정`}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3">{body}</div>
      )}
      {row.isMine ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`${rule.name} 메뉴`} disabled={pending} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem onClick={() => onEdit(row)}>
              <Pencil /> 수정
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(row)}>
              {row.isActive ? (
                <>
                  <Pause /> 중지
                </>
              ) : (
                <>
                  <Play /> 다시 시작
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}>
              <Trash2 /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-9 shrink-0" aria-hidden />
      )}
    </li>
  );
}
