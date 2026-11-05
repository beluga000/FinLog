"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { AmountInput } from "@/components/common/amount-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { isLiability } from "@/lib/finance/balance";
import { addMonthsExact, todayKST } from "@/lib/finance/period";
import { isSavingsProduct, monthlyContribution, SAVINGS_PRODUCT_KEYS, SAVINGS_PRODUCTS, type SavingsProductKey } from "@/lib/finance/savings-products";
import { institutionGroupsFor, isKnownInstitution } from "@/lib/institutions";
import type { AccountType, Visibility } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";
import { createAccount, deleteAccount, getArchiveImpact, getDeleteImpact, recordBalance, setAccountArchived, updateAccount } from "../actions";
import type { OwnerChoice } from "../rules";

interface AccountValue {
  id?: string;
  name: string;
  type: AccountType;
  institution: string | null;
  owner: OwnerChoice;
  defaultVisibility: Visibility;
  billingDay: number | null;
  paymentAccountId: string | null;
  openedOn: string | null;
  maturityDate: string | null;
  /** 연 금리 비율 (0.035 = 3.5%) */
  interestRate: number | null;
  /** 정책형 적금 (청년도약계좌·청년미래적금) */
  savingsProduct: string | null;
  savingsTier: string | null;
}

/** 폼이 고를 수 있는 것들 — 화면(서버)에서 한 번 만들어 넘긴다 */
export interface AccountFormEnv {
  isCouple: boolean;
  /** 배우자 이름 (부부일 때) */
  partnerName: string | null;
  /** 카드 대금 출금 계좌 후보 (통장·현금) */
  paymentOptions: { id: string; name: string }[];
  /** 적금 자동이체 출금 계좌 기본값 */
  defaultSourceId?: string | null;
}

const BILLING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 0.035 → "3.5" */
const pctText = (rate: number | null) => (rate === null ? "" : String(Math.round(rate * 1_000_000) / 10_000));

function AccountForm({
  initial,
  env,
  defaultType,
  onDone,
}: {
  initial?: AccountValue;
  env: AccountFormEnv;
  defaultType?: AccountType;
  onDone: () => void;
}) {
  const { isCouple } = env;
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? defaultType ?? "CHECKING");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  // 목록에 없는 금융사는 직접 입력 — 예전에 직접 쓴 값으로 수정 화면을 열면 입력칸부터 보여 준다
  const [customInst, setCustomInst] = useState(Boolean(initial?.institution && !isKnownInstitution(initial.institution)));
  // 이름이 비어 있으면 고른 금융사 이름으로 채운다 (직접 고친 이름은 덮지 않는다)
  const [autoName, setAutoName] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerChoice>(initial?.owner ?? "me");
  const [visibility, setVisibility] = useState<Visibility>(initial?.defaultVisibility ?? "SHARED");
  const [billingDay, setBillingDay] = useState<number | null>(initial?.billingDay ?? null);
  const [paymentAccountId, setPaymentAccountId] = useState(initial?.paymentAccountId ?? "");
  const [openedOn, setOpenedOn] = useState(initial?.openedOn ?? "");
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? "");
  const [ratePct, setRatePct] = useState(pctText(initial?.interestRate ?? null));
  const [product, setProduct] = useState<SavingsProductKey | "">(isSavingsProduct(initial?.savingsProduct) ? initial.savingsProduct : "");
  const [tier, setTier] = useState(initial?.savingsTier ?? "");
  const productInfo = product ? SAVINGS_PRODUCTS[product] : null;
  const tierInfo = productInfo?.tiers.find((t) => t.key === tier) ?? null;
  // 정책형 상품은 가입일만 넣으면 만기일을 채운다 (직접 넣은 만기일은 덮지 않는다)
  const fillMaturity = (p: SavingsProductKey | "", opened: string) => {
    if (p && opened && !maturityDate) setMaturityDate(addMonthsExact(opened, SAVINGS_PRODUCTS[p].termMonths));
  };
  // 새 적금: 매달 자동이체 (월 납입액을 넣을 때만 만든다)
  const [monthly, setMonthly] = useState("");
  const [payDay, setPayDay] = useState<number | null>(null);
  const [fromId, setFromId] = useState(env.defaultSourceId ?? "");
  // 비공개는 원래 내 명의였던 계좌(또는 새 계좌)를 내 명의로 둘 때만
  const canBePrivate = owner === "me" && (!initial?.id || initial.owner === "me");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const card = type === "CREDIT_CARD";
    const savings = type === "SAVINGS";
    const rate = ratePct.trim() === "" ? null : Number(ratePct);
    if (savings && rate !== null && !Number.isFinite(rate)) return setError("금리는 숫자로 입력하세요.");
    const payload = {
      name,
      type,
      institution: institution || null,
      owner,
      defaultVisibility: visibility,
      billingDay: card ? billingDay : null,
      paymentAccountId: card ? paymentAccountId || null : null,
      openedOn: savings ? openedOn || null : null,
      maturityDate: savings ? maturityDate || null : null,
      interestRatePct: savings ? rate : null,
      savingsProduct: savings ? product || null : null,
      savingsTier: savings && product ? tier || null : null,
    };
    const withAutoSave = savings && !initial?.id && monthly !== "" && BigInt(monthly) > 0n;
    if (withAutoSave && !fromId) return setError("자동이체 출금 계좌를 고르세요.");
    // 납입일을 안 고르면 가입일의 날짜, 가입일도 없으면 오늘 날짜
    const day = payDay ?? Number((openedOn || todayKST()).slice(8, 10));
    const autoSave = withAutoSave ? { amount: monthly, dayOfMonth: day, fromAccountId: fromId } : null;
    start(async () => {
      const r = initial?.id
        ? await updateAccount(initial.id, payload)
        : await createAccount({ ...payload, openingBalance: opening || "0", autoSave });
      if (!r.ok) return setError(r.error);
      toast.success(initial?.id ? "계좌를 수정했어요" : autoSave ? "계좌와 매달 자동이체를 추가했어요" : "계좌를 추가했어요");
      onDone();
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="종류" htmlFor="acc-type">
          <NativeSelect id="acc-type" value={type} disabled={!!initial?.id} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="금융사 (선택)" htmlFor="acc-inst">
          <NativeSelect
            id="acc-inst"
            value={customInst ? "__custom" : institution}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom") {
                setCustomInst(true);
                setInstitution("");
                return;
              }
              setCustomInst(false);
              setInstitution(v);
              if (v && (!name || name === autoName)) {
                setName(v);
                setAutoName(v);
              }
            }}
          >
            <option value="">선택 안 함</option>
            {institutionGroupsFor(type).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </optgroup>
            ))}
            <option value="__custom">직접 입력</option>
          </NativeSelect>
        </Field>
      </div>
      {customInst ? (
        <Field label="금융사 이름" htmlFor="acc-inst-custom">
          <Input
            id="acc-inst-custom"
            value={institution}
            maxLength={40}
            autoFocus={!initial?.id}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="예: OO저축은행"
            className="h-9"
          />
        </Field>
      ) : null}
      <Field label="이름" htmlFor="acc-name" hint="계좌번호는 입력하지 마세요. 별칭이면 충분해요.">
        <Input id="acc-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="예: 생활비 통장, 신한카드" className="h-9" />
      </Field>
      {!initial?.id ? (
        <Field
          label={isLiability(type) ? "현재 갚아야 할 금액" : "현재 잔액"}
          htmlFor="acc-open"
          hint={isLiability(type) ? "카드는 아직 결제되지 않은 사용액, 대출은 남은 원금" : "오늘 기준 잔액. 이후 거래로 자동 갱신돼요."}
        >
          <AmountInput id="acc-open" value={opening} onChange={setOpening} />
        </Field>
      ) : null}
      {type === "CREDIT_CARD" ? (
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="결제일" htmlFor="acc-billing">
            <NativeSelect
              id="acc-billing"
              value={billingDay ?? ""}
              onChange={(e) => setBillingDay(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">모름</option>
              {BILLING_DAYS.map((d) => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="출금 계좌" htmlFor="acc-pay">
            <NativeSelect id="acc-pay" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
              <option value="">선택 안 함</option>
              {env.paymentOptions
                .filter((o) => o.id !== initial?.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
            </NativeSelect>
          </Field>
          <p className="col-span-2 -mt-2 text-xs text-muted-foreground">결제일이 다가오면 홈의 확인할 일에서 대금과 통장 잔액을 알려 드려요.</p>
        </div>
      ) : null}
      {type === "SAVINGS" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="상품" htmlFor="acc-product" className="col-span-2">
            <NativeSelect
              id="acc-product"
              value={product}
              onChange={(e) => {
                const next = e.target.value as SavingsProductKey | "";
                setProduct(next);
                setTier(next ? SAVINGS_PRODUCTS[next].tiers[0].key : "");
                if (next && !name) setName(SAVINGS_PRODUCTS[next].label);
                fillMaturity(next, openedOn);
              }}
            >
              <option value="">일반 예적금</option>
              {SAVINGS_PRODUCT_KEYS.map((k) => (
                <option key={k} value={k}>{SAVINGS_PRODUCTS[k].label}</option>
              ))}
            </NativeSelect>
          </Field>
          {productInfo ? (
            <Field label="기여금 구간" htmlFor="acc-tier" className="col-span-2">
              <NativeSelect id="acc-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                {productInfo.tiers.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {productInfo ? (
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
              {productInfo.hint} 정부기여금과 비과세를 넣어 만기 예상액을 계산해요. 현재 잔액에는 내가 넣은 돈만 넣어 주세요.
            </p>
          ) : null}
          <Field label="가입일 (선택)" htmlFor="acc-opened">
            <Input
              id="acc-opened"
              type="date"
              value={openedOn}
              onChange={(e) => {
                setOpenedOn(e.target.value);
                fillMaturity(product, e.target.value);
              }}
              className="h-9"
            />
          </Field>
          <Field label="만기일 (선택)" htmlFor="acc-maturity">
            <Input id="acc-maturity" type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className="h-9" />
          </Field>
          <Field label="연 금리 % (선택)" htmlFor="acc-rate">
            <Input
              id="acc-rate"
              inputMode="decimal"
              value={ratePct}
              maxLength={6}
              onChange={(e) => setRatePct(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="예: 3.5"
              className="h-9"
            />
          </Field>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            적금·예금이면 만기일과 금리를 넣어 두세요. 고정 저축 화면에서 만기까지 남은 기간과 예상 수령액을 보여 드려요.
          </p>
        </div>
      ) : null}
      {type === "SAVINGS" && !initial?.id ? (
        <div className="grid gap-3 rounded-lg border p-3">
          <Field
            label="월 납입액 (선택)"
            htmlFor="acc-monthly"
            hint={
              productInfo
                ? `월 ${(productInfo.monthlyMax / 10_000).toLocaleString("ko-KR")}만원까지` +
                  (tierInfo && monthly && Number(monthly) > 0
                    ? ` · 정부기여금 매달 약 ${monthlyContribution(tierInfo, productInfo.monthlyMax, Number(monthly)).toLocaleString("ko-KR")}원`
                    : "")
                : "적금이면 매달 넣는 금액. 예금처럼 한 번에 넣었다면 비워 두세요."
            }
          >
            <AmountInput id="acc-monthly" value={monthly} onChange={setMonthly} placeholder="예: 300,000" />
          </Field>
          {monthly !== "" && monthly !== "0" ? (
            <>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <Field label="납입일" htmlFor="acc-payday">
                  <NativeSelect
                    id="acc-payday"
                    value={payDay ?? Number((openedOn || todayKST()).slice(8, 10))}
                    onChange={(e) => setPayDay(Number(e.target.value))}
                  >
                    {BILLING_DAYS.map((d) => (
                      <option key={d} value={d}>매월 {d}일</option>
                    ))}
                    <option value={0}>매월 말일</option>
                  </NativeSelect>
                </Field>
                <Field label="출금 계좌" htmlFor="acc-from">
                  <NativeSelect id="acc-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                    <option value="">선택하세요</option>
                    {env.paymentOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                매달 자동이체도 함께 등록돼요. 지금까지 넣은 돈은 현재 잔액에 넣고, 내일부터 납입일마다 자동으로 기록돼요
                {maturityDate ? " · 만기일에 멈춰요" : ""}.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      {isCouple ? (
        <>
          <Field label="명의" hint={owner === "partner" ? "배우자 대신 등록해요. 둘 다 수정할 수 있어요." : undefined}>
            <NativeSelect
              value={owner}
              onChange={(e) => {
                const next = e.target.value as OwnerChoice;
                setOwner(next);
                if (next !== "me" && visibility === "PRIVATE") setVisibility("SHARED");
              }}
            >
              <option value="me">내 명의</option>
              <option value="partner">{env.partnerName ? `${env.partnerName} 명의` : "배우자 명의"}</option>
              <option value="joint">공동</option>
            </NativeSelect>
          </Field>
          <Field label="기본 공개범위" hint={VISIBILITY_HINT[visibility] + " · 이 계좌로 기록하는 거래의 기본값이에요."}>
            <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              {(["SHARED", "SUMMARY_ONLY", "PRIVATE"] as const).map((v) => (
                <option key={v} value={v} disabled={v === "PRIVATE" && !canBePrivate}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
      </DialogFooter>
    </form>
  );
}

export function NewAccountButton({
  env,
  defaultType,
  label = "계좌 추가",
  variant,
}: {
  env: AccountFormEnv;
  defaultType?: AccountType;
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant={variant}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>계좌 추가</DialogTitle>
            <DialogDescription>통장, 카드, 증권, 대출 등 돈이 머무는 곳을 등록해요.</DialogDescription>
          </DialogHeader>
          {open ? <AccountForm env={env} defaultType={defaultType} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BalanceForm({ id, type, current, onDone }: { id: string; type: AccountType; current: bigint; onDone: () => void }) {
  const [pending, start] = useTransition();
  const liability = isLiability(type);
  const [value, setValue] = useState((liability ? -current : current).toString());
  const [asOf, setAsOf] = useState(todayKST());
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await recordBalance(id, { balance: value || "0", asOf });
          if (!r.ok) return setError(r.error);
          toast.success("잔액을 맞췄어요");
          onDone();
        });
      }}
    >
      <Field label={liability ? "갚아야 할 금액" : "실제 잔액 (평가액)"} htmlFor="bal">
        <AmountInput id="bal" value={value} onChange={setValue} allowNegative={!liability} />
      </Field>
      <Field label="기준일" htmlFor="bal-date" hint="그날 마감 기준 잔액이에요. 기준일 이후 거래만 이어서 반영돼요.">
        <Input id="bal-date" type="date" max={todayKST()} value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
      </DialogFooter>
    </form>
  );
}

/** 보관 확인 — 이 계좌로 오가는 자동이체가 있으면 함께 멈출지 묻는다 */
function ArchiveForm({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [impact, setImpact] = useState<{ mine: number; others: number } | null>(null);
  const [stop, setStop] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getArchiveImpact(id).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) setImpact(r.data);
      else if (!r.ok) setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {name} 계좌를 순자산과 계좌 목록에서 빼요. 거래 기록은 그대로 남고, 자산 화면 맨 아래 &lsquo;보관한 계좌&rsquo;에서 언제든 되돌릴 수 있어요.
      </p>
      {impact === null && !error ? <p className="text-sm text-muted-foreground">자동이체 확인 중…</p> : null}
      {impact && impact.mine > 0 ? (
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            이 계좌로 오가는 자동이체 {impact.mine}건도 중지
            <span className="block text-xs text-muted-foreground">해지한 계좌에 납입이 계속 기록되지 않아요. 정기 거래에서 다시 켤 수 있어요.</span>
          </span>
        </label>
      ) : null}
      {impact && impact.others > 0 ? (
        <p className="text-xs text-muted-foreground">배우자가 만든 자동이체 {impact.others}건은 배우자가 직접 중지해야 해요.</p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button
          size="lg"
          disabled={pending || (impact === null && !error)}
          onClick={() =>
            start(async () => {
              const r = await setAccountArchived(id, true, { stopRecurring: stop && (impact?.mine ?? 0) > 0 });
              if (!r.ok) return setError(r.error);
              const stopped = r.data?.stopped ?? 0;
              toast.success(stopped ? `보관했어요 · 자동이체 ${stopped}건 중지` : "보관했어요 (순자산에서 제외)");
              onDone();
            })
          }
        >
          {pending ? "보관 중…" : "보관"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** 보관한 계좌 줄의 되돌리기 버튼 */
export function RestoreAccountButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setAccountArchived(id, false);
          if (!r.ok) toast.error(r.error);
          else toast.success("다시 사용해요 · 멈춘 자동이체는 정기 거래에서 다시 켜 주세요");
        })
      }
    >
      {pending ? "되돌리는 중…" : "보관 해제"}
    </Button>
  );
}

/** 보관한 계좌 삭제 — 거래가 없는 계좌만. 먼저 확인 창에서 지울 수 있는지 보여 준다 */
export function DeleteArchivedAccountButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        삭제
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{name} 삭제</DialogTitle>
            <DialogDescription className="sr-only">보관한 계좌를 완전히 삭제합니다.</DialogDescription>
          </DialogHeader>
          {open ? <DeleteAccountForm id={id} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteAccountForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [impact, setImpact] = useState<{ transactions: number; myRules: number; otherRules: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getDeleteImpact(id).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) setImpact(r.data);
      else if (!r.ok) setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  const blocked = impact ? impact.transactions > 0 || impact.otherRules > 0 : true;
  return (
    <div className="grid gap-4">
      {impact === null && !error ? <p className="text-sm text-muted-foreground">확인 중…</p> : null}
      {impact && impact.transactions > 0 ? (
        <p className="text-sm">
          이 계좌로 기록한 거래 {impact.transactions}건이 있어 삭제할 수 없어요. 지우면 지난 리포트 숫자가 바뀌기 때문이에요. 보관해 두면 순자산과 계좌 선택에서 빠져요.
        </p>
      ) : null}
      {impact && impact.transactions === 0 && impact.otherRules > 0 ? (
        <p className="text-sm">배우자가 만든 자동이체 {impact.otherRules}건이 연결돼 있어요. 배우자가 먼저 그 자동이체를 삭제해야 해요.</p>
      ) : null}
      {impact && !blocked ? (
        <p className="text-sm">
          거래 기록이 없는 계좌라 삭제할 수 있어요.
          {impact.myRules > 0 ? ` 연결된 자동이체 ${impact.myRules}건도 함께 삭제돼요.` : ""} 삭제하면 되돌릴 수 없어요.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        {blocked ? (
          <Button size="lg" variant="outline" onClick={onDone}>
            닫기
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAccount(id);
                if (!r.ok) return setError(r.error);
                toast.success("계좌를 삭제했어요");
                onDone();
              })
            }
          >
            {pending ? "삭제 중…" : "삭제"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

export function AccountMenu({
  account,
  balance,
  env,
}: {
  account: AccountValue & { id: string; isArchived: boolean };
  balance: bigint;
  env: AccountFormEnv;
}) {
  const [dialog, setDialog] = useState<"balance" | "edit" | "archive" | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${account.name} 메뉴`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/ledger?account=${account.id}`} />}>거래 내역</DropdownMenuItem>
          {/* 보이는 계좌는 모두 관리 가능 (부부는 서로의 계좌도) — 서버에서 다시 확인한다 */}
          <DropdownMenuItem onClick={() => setDialog("balance")}>잔액 맞추기</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("edit")}>수정</DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onClick={() =>
              account.isArchived
                ? start(async () => {
                    const r = await setAccountArchived(account.id, false);
                    if (!r.ok) toast.error(r.error);
                    else toast.success("다시 사용해요");
                  })
                : setDialog("archive")
            }
          >
            {account.isArchived ? "보관 해제" : "보관 (해지한 계좌)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog === "balance" ? `${account.name} 잔액 맞추기` : dialog === "archive" ? `${account.name} 보관` : "계좌 수정"}
            </DialogTitle>
            <DialogDescription className="sr-only">계좌 정보를 변경합니다.</DialogDescription>
          </DialogHeader>
          {dialog === "balance" ? <BalanceForm id={account.id} type={account.type} current={balance} onDone={() => setDialog(null)} /> : null}
          {dialog === "edit" ? <AccountForm initial={account} env={env} onDone={() => setDialog(null)} /> : null}
          {dialog === "archive" ? <ArchiveForm id={account.id} name={account.name} onDone={() => setDialog(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
