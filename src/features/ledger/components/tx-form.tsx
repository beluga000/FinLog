"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LIABILITY_TYPES, SAVING_DESTINATION_TYPES } from "@/lib/finance/balance";
import { todayKST } from "@/lib/finance/period";
import { TX_TYPE_META, TX_TYPES_ORDER, validateTxShape } from "@/lib/finance/tx-rules";
import type { AccountType, TxType, Visibility } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";
import { createRecurringRule, createTransaction, deleteTransaction, updateTransaction } from "../actions";
import type { CategoryRow, TxRow } from "../queries";

export interface AccountOption {
  id: string;
  name: string;
  type: AccountType;
  ownerUserId: string | null;
  defaultVisibility: Visibility;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  mode?: "tx" | "recurring";
  /** 편집 대상 (tx 모드) */
  initial?: TxRow | null;
  defaultType?: TxType;
}

const CASH_LIKE: AccountType[] = ["CASH", "CHECKING", "SAVINGS"];

/** 유형별 선택 가능한 계좌 */
function accountFilter(type: TxType, side: "from" | "to"): (t: AccountType) => boolean {
  switch (type) {
    case "EXPENSE":
      return (t) => t !== "LOAN";
    case "INCOME":
      return (t) => !LIABILITY_TYPES.includes(t);
    case "SAVE_INVEST":
      return side === "from" ? (t) => CASH_LIKE.includes(t) : (t) => SAVING_DESTINATION_TYPES.includes(t);
    case "LOAN_REPAY":
      return side === "from" ? (t) => !LIABILITY_TYPES.includes(t) : (t) => t === "LOAN";
    default:
      return () => true;
  }
}

const LAST_ACCOUNT_KEY = "finlog:last-account";

function readLastAccounts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function rememberAccount(key: string, id: string | null) {
  if (!id) return;
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify({ ...readLastAccounts(), [key]: id }));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

export function TxFormDialog(props: Props) {
  const { open, onOpenChange, initial, mode = "tx" } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "recurring" ? "정기 거래 추가" : initial ? "거래 수정" : "거래 기록"}</DialogTitle>
          <DialogDescription className="sr-only">거래 유형, 금액, 계좌를 입력합니다.</DialogDescription>
        </DialogHeader>
        {open ? <TxForm {...props} key={initial?.id ?? "new"} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TxForm({ onOpenChange, accounts, categories, viewerId, isCouple, mode = "tx", initial, defaultType }: Props) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<TxType>(initial?.type ?? defaultType ?? "EXPENSE");
  const [amount, setAmount] = useState(initial ? initial.amount.toString() : "");
  const [date, setDate] = useState(initial?.date ?? todayKST());
  const [fromAccountId, setFrom] = useState<string>(initial?.fromAccountId ?? "");
  const [toAccountId, setTo] = useState<string>(initial?.toAccountId ?? "");
  const [adjustDir, setAdjustDir] = useState<"up" | "down">(initial?.fromAccountId ? "down" : "up");
  const [categoryId, setCategory] = useState<string>(initial?.categoryId ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [visibility, setVisibility] = useState<Visibility | null>(initial?.visibility ?? null);
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? false);
  const [error, setError] = useState<string | null>(null);
  // 정기 거래 전용
  const [name, setName] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(25);
  const [adjust, setAdjust] = useState<"NONE" | "PREV" | "NEXT">("NONE");
  const [startDate, setStartDate] = useState(todayKST());
  const [endDate, setEndDate] = useState("");

  const meta = TX_TYPE_META[type];
  const isMine = !initial || initial.createdByUserId === viewerId;
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // 새 거래: 유형별로 마지막에 쓴 계좌를 기본 선택
  useEffect(() => {
    if (initial) return;
    const last = readLastAccounts();
    const pick = (side: "from" | "to") => {
      const ok = accountFilter(type, side);
      const remembered = last[`${type}:${side}`];
      if (remembered && byId.get(remembered) && ok(byId.get(remembered)!.type)) return remembered;
      return accounts.find((a) => ok(a.type))?.id ?? "";
    };
    setFrom(meta.from ? pick("from") : "");
    setTo(meta.to ? pick("to") : "");
    setCategory("");
  }, [type, initial, accounts, byId, meta.from, meta.to]);

  const typeCategories = categories.filter((c) => c.txType === type);
  const parents = typeCategories.filter((c) => !c.parentId);

  const resolvedFrom = type === "ADJUSTMENT" ? (adjustDir === "down" ? fromAccountId || toAccountId : null) : fromAccountId || null;
  const resolvedTo = type === "ADJUSTMENT" ? (adjustDir === "up" ? toAccountId || fromAccountId : null) : toAccountId || null;

  const effectiveVisibility: Visibility =
    visibility ??
    (resolvedFrom ? byId.get(resolvedFrom)?.defaultVisibility : undefined) ??
    (resolvedTo ? byId.get(resolvedTo)?.defaultVisibility : undefined) ??
    "SHARED";

  function submit() {
    setError(null);
    if (!amount || amount === "0") return setError("금액을 입력하세요.");
    const shapeErrors = validateTxShape({
      type,
      fromAccountId: resolvedFrom,
      toAccountId: resolvedTo,
      fromAccountType: resolvedFrom ? byId.get(resolvedFrom)?.type ?? null : null,
      toAccountType: resolvedTo ? byId.get(resolvedTo)?.type ?? null : null,
      categoryId: meta.category ? categoryId || null : null,
    });
    if (shapeErrors.length) return setError(shapeErrors[0]);

    const tx = {
      type,
      date,
      amount,
      fromAccountId: resolvedFrom,
      toAccountId: resolvedTo,
      categoryId: meta.category ? categoryId || null : null,
      merchant: merchant || null,
      memo: memo || null,
      visibility,
      isFixed: type === "EXPENSE" ? isFixed : false,
    };

    startTransition(async () => {
      let result;
      if (mode === "recurring") {
        const { date: _omit, ...template } = tx;
        void _omit;
        result = await createRecurringRule({
          name: name || merchant || TX_TYPE_META[type].label,
          tx: template,
          dayOfMonth,
          businessDayAdjust: adjust,
          startDate,
          endDate: endDate || null,
        });
      } else if (initial) {
        result = await updateTransaction(initial.id, tx);
      } else {
        result = await createTransaction(tx);
      }
      if (!result.ok) return setError(result.error);
      rememberAccount(`${type}:from`, tx.fromAccountId);
      rememberAccount(`${type}:to`, tx.toAccountId);
      toast.success(mode === "recurring" ? "정기 거래를 등록했어요" : initial ? "수정했어요" : "기록했어요");
      onOpenChange(false);
    });
  }

  function remove() {
    if (!initial) return;
    startTransition(async () => {
      const result = await deleteTransaction(initial.id);
      if (!result.ok) return setError(result.error);
      toast.success("삭제했어요");
      onOpenChange(false);
    });
  }

  const accountSelect = (side: "from" | "to", value: string, onChange: (v: string) => void, label: string) => {
    const ok = type === "ADJUSTMENT" ? () => true : accountFilter(type, side);
    const options = accounts.filter((a) => ok(a.type));
    return (
      <Field label={label} htmlFor={`acc-${side}`}>
        <NativeSelect id={`acc-${side}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">선택</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {ACCOUNT_TYPE_LABEL[a.type]}
              {a.ownerUserId === null ? " (공동)" : a.ownerUserId !== viewerId ? " (배우자)" : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
    );
  };

  if (!accounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        먼저 <a className="font-medium text-foreground underline" href="/assets">자산</a>에서 계좌(통장·카드)를 등록하세요.
      </p>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="거래 유형">
        {TX_TYPES_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-sm transition-colors",
              type === t ? "border-foreground bg-foreground text-background font-semibold" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {TX_TYPE_META[t].label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{meta.hint}</p>

      <Field label="금액" htmlFor="amount">
        <AmountInput id="amount" value={amount} onChange={setAmount} quickAdd={[10_000, 50_000, 100_000]} autoFocus={!initial} />
      </Field>

      {mode === "tx" ? (
        <Field label="날짜" htmlFor="date">
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        </Field>
      ) : null}

      {type === "ADJUSTMENT" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {accountSelect("to", toAccountId || fromAccountId, (v) => {
            setTo(v);
            setFrom(v);
          }, "계좌")}
          <Field label="방향">
            <NativeSelect value={adjustDir} onChange={(e) => setAdjustDir(e.target.value as "up" | "down")}>
              <option value="up">늘어남 (평가이익 등)</option>
              <option value="down">줄어듦 (평가손실 등)</option>
            </NativeSelect>
          </Field>
        </div>
      ) : (
        <div className={cn("grid gap-3", meta.from && meta.to && "sm:grid-cols-2")}>
          {meta.from ? accountSelect("from", fromAccountId, setFrom, type === "EXPENSE" ? "결제 수단" : "출금 계좌") : null}
          {meta.to ? accountSelect("to", toAccountId, setTo, "입금 계좌") : null}
        </div>
      )}

      {meta.category ? (
        <Field label="카테고리" htmlFor="category">
          <NativeSelect id="category" value={categoryId} onChange={(e) => setCategory(e.target.value)}>
            <option value="">선택</option>
            {parents.map((p) => {
              const children = typeCategories.filter((c) => c.parentId === p.id);
              if (!children.length) return <option key={p.id} value={p.id}>{p.name}</option>;
              return (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name} (전체)</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </NativeSelect>
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={type === "INCOME" ? "보낸 곳" : "사용처"} htmlFor="merchant">
          <Input id="merchant" value={merchant} maxLength={100} onChange={(e) => setMerchant(e.target.value)} className="h-9" placeholder="선택 입력" />
        </Field>
        <Field label="메모" htmlFor="memo">
          <Input id="memo" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} className="h-9" placeholder="선택 입력" />
        </Field>
      </div>

      {type === "EXPENSE" && mode === "tx" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} className="size-4" />
          고정 지출 (매달 나가는 돈)
        </label>
      ) : null}

      {isCouple && isMine ? (
        <Field label="배우자에게 보이기" hint={VISIBILITY_HINT[effectiveVisibility] + (visibility === null ? " · 계좌 기본값" : "")}>
          <div className="grid grid-cols-3 gap-1.5">
            {(["SHARED", "SUMMARY_ONLY", "PRIVATE"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                aria-pressed={effectiveVisibility === v}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-sm",
                  effectiveVisibility === v ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {VISIBILITY_LABEL[v]}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      {mode === "recurring" ? (
        <div className="grid gap-3 rounded-lg border p-3">
          <Field label="이름" htmlFor="rule-name">
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 월급, 월세, 적금" className="h-9" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="매월" htmlFor="dom">
              <NativeSelect id="dom" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}일</option>
                ))}
                <option value={0}>말일</option>
              </NativeSelect>
            </Field>
            <Field label="주말이면" htmlFor="adj">
              <NativeSelect id="adj" value={adjust} onChange={(e) => setAdjust(e.target.value as typeof adjust)}>
                <option value="NONE">그대로</option>
                <option value="PREV">직전 금요일</option>
                <option value="NEXT">다음 월요일</option>
              </NativeSelect>
            </Field>
            <Field label="시작일" htmlFor="start">
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </Field>
            <Field label="종료일" htmlFor="end">
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">시작일부터 오늘까지 지난 회차도 바로 생성됩니다.</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter className="gap-2">
        {initial ? (
          <Button type="button" variant="destructive" onClick={remove} disabled={pending} className="sm:mr-auto">
            삭제
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="min-w-24">
          {pending ? "저장 중…" : "저장"}
        </Button>
      </DialogFooter>
    </form>
  );
}
