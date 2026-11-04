"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LIABILITY_TYPES, SAVING_DESTINATION_TYPES } from "@/lib/finance/balance";
import type { ParsedCardMessage } from "@/lib/finance/card-message";
import { addDays, todayKST } from "@/lib/finance/period";
import { TX_TYPE_META, TX_TYPES_ORDER, validateTxShape } from "@/lib/finance/tx-rules";
import type { AccountType, TxType, Visibility } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";
import { Money } from "@/components/common/money";
import {
  createRecurringRule,
  updateRecurringRule,
  createTransaction,
  deleteTransaction,
  getMerchantSuggestions,
  inspectPastedExpense,
  updateTransaction,
  type PastedExpenseInfo,
  type SpendableChange,
} from "../actions";
import type { CategoryRow, MerchantSuggestion, RecurringTemplate, TxRow } from "../queries";
import { PasteMessage } from "./paste-message";

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
  /** 편집 대상 정기 규칙 (recurring 모드) */
  rule?: RecurringRuleEdit | null;
  defaultType?: TxType;
  /** 새 거래를 미리 채운 상태로 연다 (예: 카드 대금 결제 이체) */
  draft?: TxDraft | null;
  /** 문자로 채우기 진입 — 공유받기 원문 또는 iOS 단축어(입력칸 펼침) */
  paste?: { text?: string; expanded?: boolean };
}

export interface RecurringRuleEdit {
  id: string;
  name: string;
  template: RecurringTemplate;
  dayOfMonth: number;
  businessDayAdjust: "NONE" | "PREV" | "NEXT";
  startDate: string;
  endDate: string | null;
}

export interface TxDraft {
  type: TxType;
  amount: bigint;
  date?: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  memo?: string;
  /** '다시 기록'(거래 복사)에서 채운다 */
  categoryId?: string | null;
  merchant?: string | null;
  visibility?: Visibility | null;
}

/** 기존 거래를 오늘 날짜의 새 거래로 — 금액·계좌·카테고리·사용처를 그대로 가져온다 */
function copyDraft(tx: TxRow, viewerId: string): TxDraft {
  return {
    type: tx.type,
    amount: tx.amount,
    fromAccountId: tx.fromAccountId,
    toAccountId: tx.toAccountId,
    memo: tx.memo ?? undefined,
    categoryId: tx.categoryId,
    merchant: tx.merchant,
    // 배우자 거래를 복사하면 공개 범위는 내 계좌 기본값을 따른다
    visibility: tx.createdByUserId === viewerId ? tx.visibility : null,
  };
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

/** 유형별 최근 쓴 카테고리 (최신이 앞) — 간편 입력의 카테고리 버튼 순서와 기본 선택에 쓴다 */
const RECENT_CATEGORY_KEY = "finlog:recent-categories";
const RECENT_CATEGORY_MAX = 6;

function readRecentCategories(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_CATEGORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function rememberCategory(type: TxType, id: string | null) {
  if (!id) return;
  try {
    const all = readRecentCategories();
    const next = [id, ...(all[type] ?? []).filter((c) => c !== id)].slice(0, RECENT_CATEGORY_MAX);
    localStorage.setItem(RECENT_CATEGORY_KEY, JSON.stringify({ ...all, [type]: next }));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

/** 처음부터 보이는 유형 — 나머지(이체·대출상환·잔액보정)는 펼쳐서 고른다 */
const MAIN_TYPES: TxType[] = ["EXPENSE", "INCOME", "SAVE_INVEST"];
const CATEGORY_CHIP_COUNT = 8;

function dateLabel(date: string) {
  const today = todayKST();
  if (date === today) return "오늘";
  if (date === addDays(today, -1)) return "어제";
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export function TxFormDialog(props: Props) {
  const { open, onOpenChange, initial, mode = "tx" } = props;
  const [saved, setSaved] = useState<SpendableChange | null>(null);
  // 문자 채우기는 첫 기록에만 — "하나 더 기록"에서 같은 문자를 다시 채우지 않는다
  const [pasteUsed, setPasteUsed] = useState(false);
  // '다시 기록' — 편집 중인 거래를 복사해 새 거래 폼으로 바꾼다
  const [copyOf, setCopyOf] = useState<TxRow | null>(null);
  // 닫을 때 결과 화면도 초기화 — 다음에 열면 빈 폼부터
  const change = (o: boolean) => {
    if (!o) {
      setSaved(null);
      setPasteUsed(false);
      setCopyOf(null);
    }
    onOpenChange(o);
  };
  const onSaved = (c: SpendableChange) => {
    setSaved(c);
    setPasteUsed(true);
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {saved ? "기록했어요" : mode === "recurring" ? (props.rule ? "정기 거래 수정" : "정기 거래 추가") : initial && !copyOf ? "거래 수정" : "거래 기록"}
          </DialogTitle>
          <DialogDescription className="sr-only">거래 유형, 금액, 계좌를 입력합니다.</DialogDescription>
        </DialogHeader>
        {!open ? null : saved ? (
          <SavedResult change={saved} onAgain={() => setSaved(null)} onClose={() => change(false)} />
        ) : (
          <TxForm
            {...props}
            initial={copyOf ? null : initial}
            draft={copyOf ? copyDraft(copyOf, props.viewerId) : props.draft}
            paste={pasteUsed ? undefined : props.paste}
            onOpenChange={change}
            onSaved={onSaved}
            onCopy={mode === "tx" ? setCopyOf : undefined}
            key={
              copyOf
                ? `copy:${copyOf.id}`
                : (initial?.id ?? props.rule?.id ?? (props.draft ? `draft:${props.draft.toAccountId}:${props.draft.fromAccountId}` : "new"))
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 저장 결과 — 쓸 수 있는 돈이 얼마에서 얼마로 바뀌었는지 (AC-13) */
function SavedResult({ change, onAgain, onClose }: { change: SpendableChange; onAgain: () => void; onClose: () => void }) {
  const over = change.after < 0n;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 rounded-lg bg-muted px-4 py-3">
        <div className="text-xs text-muted-foreground">이번 달 쓸 수 있는 돈</div>
        <div className="flex flex-wrap items-baseline gap-x-2 tabular">
          <Money value={change.before} className="text-sm text-muted-foreground line-through" />
          <span className="text-muted-foreground" aria-hidden>→</span>
          <span className="sr-only">에서</span>
          <Money
            value={over ? -change.after : change.after}
            className={cn("text-2xl font-bold", over && "text-critical")}
          />
          {over ? <span className="text-sm font-medium text-critical">초과</span> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {over ? "이번 달 남은 기간은 지출을 줄여야 해요." : <>오늘부터 하루 <Money value={change.daily} />씩 쓸 수 있어요.</>}
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onAgain}>
          하나 더 기록
        </Button>
        <Button type="button" size="lg" onClick={onClose} className="min-w-24">
          확인
        </Button>
      </DialogFooter>
    </div>
  );
}

function TxForm({
  onOpenChange,
  onSaved,
  accounts,
  categories,
  viewerId,
  isCouple,
  mode = "tx",
  initial,
  rule,
  defaultType,
  draft,
  paste,
  onCopy,
}: Props & { onSaved: (change: SpendableChange) => void; onCopy?: (tx: TxRow) => void }) {
  const [pending, startTransition] = useTransition();
  // 수정 대상: 거래(initial) 또는 정기 규칙의 템플릿
  const edit = initial ?? (rule ? { ...rule.template, amount: BigInt(rule.template.amount), date: undefined } : null);
  const seed = edit ?? draft;
  const [type, setType] = useState<TxType>(seed?.type ?? defaultType ?? "EXPENSE");
  // 금액 없이 계좌만 미리 채운 경우(0원)는 빈칸으로 둔다
  const [amount, setAmount] = useState(seed && seed.amount > 0n ? seed.amount.toString() : "");
  const [date, setDate] = useState(seed?.date ?? todayKST());
  const [fromAccountId, setFrom] = useState<string>(seed?.fromAccountId ?? "");
  const [toAccountId, setTo] = useState<string>(seed?.toAccountId ?? "");
  const [adjustDir, setAdjustDir] = useState<"up" | "down">(initial?.fromAccountId ? "down" : "up");
  const [categoryId, setCategory] = useState<string>(edit?.categoryId ?? draft?.categoryId ?? "");
  const [merchant, setMerchant] = useState(edit?.merchant ?? draft?.merchant ?? "");
  const [memo, setMemo] = useState(seed?.memo ?? "");
  const [visibility, setVisibility] = useState<Visibility | null>(edit?.visibility ?? draft?.visibility ?? null);
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? false);
  const [error, setError] = useState<string | null>(null);
  // 문자로 채운 지출 — 저장 전에 중복 확인 (AC-23)
  const [fromMessage, setFromMessage] = useState(false);
  const [duplicate, setDuplicate] = useState<PastedExpenseInfo["duplicate"]>(null);
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);
  // 정기 거래 전용
  const [name, setName] = useState(rule?.name ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ?? 25);
  const [adjust, setAdjust] = useState<"NONE" | "PREV" | "NEXT">(rule?.businessDayAdjust ?? "NONE");
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayKST());
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  // 간편 입력: 새 거래는 금액·카테고리·결제 수단만 먼저 보이고, 나머지는 '더 보기'로 접는다
  const [showMore, setShowMore] = useState(Boolean(initial || rule || mode === "recurring" || draft));
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [recent, setRecent] = useState<Record<string, string[]>>({});
  useEffect(() => setRecent(readRecentCategories()), []);
  // 사용처 자동완성 — 유형별로 한 번만 불러온다
  const [suggestions, setSuggestions] = useState<MerchantSuggestion[]>([]);
  const [merchantFocused, setMerchantFocused] = useState(false);
  // 사용자가 카테고리를 직접 고른 뒤에는 사용처 입력이 그 선택을 덮지 않는다
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial));
  const pickCategory = (id: string) => {
    setCategoryTouched(true);
    setCategory(id);
  };
  const suggestionCache = useRef(new Map<TxType, MerchantSuggestion[]>());
  useEffect(() => {
    const cached = suggestionCache.current.get(type);
    if (cached) return setSuggestions(cached);
    let alive = true;
    void getMerchantSuggestions(type).then((list) => {
      suggestionCache.current.set(type, list);
      if (alive) setSuggestions(list);
    });
    return () => {
      alive = false;
    };
  }, [type]);

  const meta = TX_TYPE_META[type];
  const isMine = !initial || initial.createdByUserId === viewerId;
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // 새 거래: 유형별로 마지막에 쓴 계좌를 기본 선택.
  // 유형이 실제로 바뀔 때만 — 서버 액션 뒤 레이아웃이 다시 그려져 accounts 가 새 배열이 돼도 입력값을 지우지 않게
  // 미리 채운 거래(draft)는 그 계좌를 그대로 쓴다
  const appliedType = useRef<TxType | null>(draft?.type ?? rule?.template.type ?? null);
  useEffect(() => {
    if (initial || appliedType.current === type) return;
    appliedType.current = type;
    const last = readLastAccounts();
    const pick = (side: "from" | "to") => {
      const ok = accountFilter(type, side);
      const remembered = last[`${type}:${side}`];
      if (remembered && byId.get(remembered) && ok(byId.get(remembered)!.type)) return remembered;
      return accounts.find((a) => ok(a.type))?.id ?? "";
    };
    setFrom(meta.from ? pick("from") : "");
    setTo(meta.to ? pick("to") : "");
    // 이 유형에서 마지막에 쓴 카테고리를 미리 선택 — 다르면 버튼 한 번으로 바꾼다
    const lastCategory = meta.category ? readRecentCategories()[type]?.[0] : undefined;
    setCategory(lastCategory && categories.some((c) => c.id === lastCategory && c.txType === type) ? lastCategory : "");
    setCategoryTouched(false);
  }, [type, initial, accounts, byId, meta.from, meta.to, meta.category, categories]);

  // 문자 카드사에 맞는 결제 수단 — 위 기본값 효과 뒤에 적용되도록 이 순서를 유지한다
  useEffect(() => {
    if (!pendingAccount) return;
    setFrom(pendingAccount);
    setPendingAccount(null);
  }, [pendingAccount, type]);

  function applyParsed(p: ParsedCardMessage) {
    setType("EXPENSE");
    setAmount(p.amount!.toString());
    if (p.date) setDate(p.date);
    if (p.merchant) setMerchant(p.merchant);
    setFromMessage(true);
    setDuplicate(null);
    // 계좌 이름에 카드사명(신한·현대 …)이 들어간 카드 → 없으면 같은 이름의 다른 결제 수단
    const short = p.issuer?.replace(/카드|뱅크/g, "");
    if (short) {
      const named = accounts.filter((a) => a.type !== "LOAN" && a.name.includes(short));
      const card = named.find((a) => a.type === "CREDIT_CARD") ?? named[0];
      if (card) setPendingAccount(card.id);
    }
    const amountStr = p.amount!.toString();
    const dateStr = p.date ?? date;
    void inspectPastedExpense({ amount: amountStr, date: dateStr, merchant: p.merchant }).then((info) => {
      if (info.categoryId) setCategory(info.categoryId);
    });
  }

  /** 사용처를 고르면 그곳에 지난번 쓴 카테고리·계좌로 채운다 (지금 목록에 없는 값은 건너뜀) */
  function applySuggestion(sg: MerchantSuggestion) {
    setMerchant(sg.merchant);
    if (meta.category && sg.categoryId && categories.some((c) => c.id === sg.categoryId && c.txType === type)) setCategory(sg.categoryId);
    const usable = (id: string | null, side: "from" | "to") => {
      const acc = id ? byId.get(id) : undefined;
      return acc && (type === "ADJUSTMENT" || accountFilter(type, side)(acc.type)) ? acc.id : null;
    };
    const from = meta.from ? usable(sg.fromAccountId, "from") : null;
    const to = meta.to ? usable(sg.toAccountId, "to") : null;
    if (from) setFrom(from);
    if (to) setTo(to);
  }

  const merchantQuery = merchant.trim();
  const exactSuggestion = merchantQuery ? suggestions.find((sg) => sg.merchant === merchantQuery) : undefined;
  const shownSuggestions = exactSuggestion
    ? []
    : (merchantQuery ? suggestions.filter((sg) => sg.merchant.toLowerCase().includes(merchantQuery.toLowerCase())) : suggestions).slice(0, 6);

  const typeCategories = categories.filter((c) => c.txType === type);
  const parents = typeCategories.filter((c) => !c.parentId);
  // 카테고리 버튼: 최근 쓴 것 먼저, 남는 자리는 대분류 순서대로
  const byCategory = new Map(typeCategories.map((c) => [c.id, c]));
  const chipIds = (recent[type] ?? []).filter((id) => byCategory.has(id));
  for (const p of parents) {
    if (chipIds.length >= CATEGORY_CHIP_COUNT) break;
    if (!chipIds.includes(p.id)) chipIds.push(p.id);
  }
  const categoryChips = chipIds.slice(0, CATEGORY_CHIP_COUNT).map((id) => byCategory.get(id)!);

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
      if (fromMessage && !duplicate && mode === "tx" && !initial && type === "EXPENSE") {
        const info = await inspectPastedExpense({ amount, date, merchant: merchant || null });
        if (info.duplicate) return setDuplicate(info.duplicate);
      }
      let result;
      if (mode === "recurring") {
        const { date: _omit, ...template } = tx;
        void _omit;
        const input = {
          name: name || merchant || TX_TYPE_META[type].label,
          tx: template,
          dayOfMonth,
          businessDayAdjust: adjust,
          startDate,
          endDate: endDate || null,
        };
        result = rule ? await updateRecurringRule(rule.id, input) : await createRecurringRule(input);
      } else if (initial) {
        result = await updateTransaction(initial.id, tx);
      } else {
        result = await createTransaction(tx);
      }
      if (!result.ok) return setError(result.error);
      rememberAccount(`${type}:from`, tx.fromAccountId);
      rememberAccount(`${type}:to`, tx.toAccountId);
      if (mode === "tx") rememberCategory(type, tx.categoryId);
      const change = result.data && "spendable" in result.data ? result.data.spendable : null;
      if (change) return onSaved(change);
      toast.success(mode === "recurring" ? (rule ? "정기 거래를 수정했어요" : "정기 거래를 등록했어요") : initial ? "수정했어요" : "기록했어요");
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
      <div className="grid gap-1.5">
        <div className="seg grid grid-cols-3" role="radiogroup" aria-label="거래 유형">
          {(showAllTypes || !MAIN_TYPES.includes(type) ? TX_TYPES_ORDER : MAIN_TYPES).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className="seg-item py-1.5 text-sm"
            >
              {TX_TYPE_META[t].label}
            </button>
          ))}
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
          {!showAllTypes && MAIN_TYPES.includes(type) ? (
            <button
              type="button"
              onClick={() => setShowAllTypes(true)}
              className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              이체·대출상환·보정
            </button>
          ) : null}
        </div>
      </div>

      {mode === "tx" && !initial ? (
        <PasteMessage initialText={paste?.text} expanded={paste?.expanded} onParsed={applyParsed} />
      ) : null}

      <Field label="금액" htmlFor="amount">
        <AmountInput id="amount" value={amount} onChange={setAmount} quickAdd={[10_000, 50_000, 100_000]} autoFocus={!initial} />
      </Field>

      {type !== "ADJUSTMENT" ? (
        <Field label={type === "INCOME" ? "보낸 곳" : "사용처"} htmlFor="merchant">
          <Input
            id="merchant"
            value={merchant}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setMerchant(e.target.value)}
            onFocus={() => setMerchantFocused(true)}
            // 칩을 누르는 동안 목록이 사라지지 않게 잠깐 늦춘다
            onBlur={() => {
              setTimeout(() => setMerchantFocused(false), 150);
              if (exactSuggestion && !categoryTouched) applySuggestion(exactSuggestion);
            }}
            className="h-9"
            placeholder={suggestions.length ? "입력하거나 아래에서 고르세요" : "선택 입력"}
          />
          {/* 자주 쓴 사용처 — 고르면 지난번 카테고리·결제 수단까지 채운다. 새 거래는 비어 있을 때도 보여 준다 */}
          {shownSuggestions.length && (merchantFocused || (!initial && !merchantQuery)) ? (
            <div className="flex flex-wrap gap-1.5" aria-label="자주 쓴 사용처">
              {shownSuggestions.map((sg) => (
                <button
                  key={sg.merchant}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(sg)}
                  className="max-w-full truncate rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
                >
                  {sg.merchant}
                </button>
              ))}
            </div>
          ) : null}
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
          {/* 자주 쓰는 카테고리는 버튼 한 번으로 — 나머지는 아래 목록에서 */}
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="자주 쓰는 카테고리">
            {categoryChips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoryId === c.id}
                onClick={() => pickCategory(c.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  categoryId === c.id ? "border-brand bg-brand-soft font-semibold text-brand" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <NativeSelect id="category" value={categoryId} onChange={(e) => pickCategory(e.target.value)} className="h-8">
            <option value="">{categoryChips.length ? "다른 카테고리" : "선택"}</option>
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

      {showMore ? (
        <div className="grid gap-4">
          {mode === "tx" ? (
            <Field label="날짜" htmlFor="date">
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 1, 2].map((back) => {
                  const d = addDays(todayKST(), -back);
                  return (
                    <button
                      key={back}
                      type="button"
                      aria-pressed={date === d}
                      onClick={() => setDate(d)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        date === d ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {["오늘", "어제", "그제"][back]}
                    </button>
                  );
                })}
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-full sm:w-auto sm:min-w-0 sm:flex-1" />
              </div>
            </Field>
          ) : null}

          <Field label="메모" htmlFor="memo">
            <Input id="memo" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} className="h-9" placeholder="선택 입력" />
          </Field>

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
        </div>
      ) : (
        // 접힌 상태에서도 지금 값이 무엇인지 보여 준다 (기본: 오늘 · 계좌 공개 범위)
        <button
          type="button"
          onClick={() => setShowMore(true)}
          aria-expanded={false}
          className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <span className="min-w-0 truncate">
            {[
              mode === "tx" ? dateLabel(date) : null,
              memo ? "메모 있음" : null,
              type === "EXPENSE" && isFixed ? "고정 지출" : null,
              isCouple && isMine ? VISIBILITY_LABEL[effectiveVisibility] : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs">
            날짜·메모
            <ChevronDown className="size-3.5" />
          </span>
        </button>
      )}

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
          <p className="text-xs text-muted-foreground">
            {rule ? "이미 생성된 거래는 그대로 두고, 다음 회차부터 바뀐 내용으로 생성돼요." : "시작일부터 오늘까지 지난 회차도 바로 생성됩니다."}
          </p>
        </div>
      ) : null}

      {duplicate ? (
        <div role="alert" className="grid gap-1 rounded-lg border border-warning/50 px-3 py-2 text-sm">
          <span className="font-medium text-warning">이미 기록한 것 같아요</span>
          <span className="text-muted-foreground">
            {duplicate.date} · {duplicate.merchant ?? "사용처 없음"} · <Money value={duplicate.amount} />
          </span>
          <span className="text-xs text-muted-foreground">다른 거래가 맞으면 저장을 한 번 더 누르세요.</span>
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
        {initial && onCopy ? (
          <Button type="button" variant="outline" onClick={() => onCopy(initial)} disabled={pending}>
            오늘 다시 기록
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="min-w-24">
          {pending ? "저장 중…" : "저장"}
        </Button>
      </DialogFooter>
    </form>
  );
}
