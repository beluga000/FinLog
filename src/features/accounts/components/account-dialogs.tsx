"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import { todayKST } from "@/lib/finance/period";
import type { AccountType, Visibility } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";
import { createAccount, recordBalance, setAccountArchived, updateAccount } from "../actions";
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
}

/** 폼이 고를 수 있는 것들 — 화면(서버)에서 한 번 만들어 넘긴다 */
export interface AccountFormEnv {
  isCouple: boolean;
  /** 배우자 이름 (부부일 때) */
  partnerName: string | null;
  /** 카드 대금 출금 계좌 후보 (통장·현금) */
  paymentOptions: { id: string; name: string }[];
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
  const [owner, setOwner] = useState<OwnerChoice>(initial?.owner ?? "me");
  const [visibility, setVisibility] = useState<Visibility>(initial?.defaultVisibility ?? "SHARED");
  const [billingDay, setBillingDay] = useState<number | null>(initial?.billingDay ?? null);
  const [paymentAccountId, setPaymentAccountId] = useState(initial?.paymentAccountId ?? "");
  const [openedOn, setOpenedOn] = useState(initial?.openedOn ?? "");
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? "");
  const [ratePct, setRatePct] = useState(pctText(initial?.interestRate ?? null));
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
    };
    start(async () => {
      const r = initial?.id ? await updateAccount(initial.id, payload) : await createAccount({ ...payload, openingBalance: opening || "0" });
      if (!r.ok) return setError(r.error);
      toast.success(initial?.id ? "계좌를 수정했어요" : "계좌를 추가했어요");
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
          <Input id="acc-inst" value={institution} maxLength={40} onChange={(e) => setInstitution(e.target.value)} className="h-9" />
        </Field>
      </div>
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
          <Field label="가입일 (선택)" htmlFor="acc-opened">
            <Input id="acc-opened" type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} className="h-9" />
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

export function AccountMenu({
  account,
  balance,
  env,
}: {
  account: AccountValue & { id: string; isArchived: boolean };
  balance: bigint;
  env: AccountFormEnv;
}) {
  const [dialog, setDialog] = useState<"balance" | "edit" | null>(null);
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
              start(async () => {
                const r = await setAccountArchived(account.id, !account.isArchived);
                if (!r.ok) toast.error(r.error);
                else toast.success(account.isArchived ? "다시 사용해요" : "보관했어요 (순자산에서 제외)");
              })
            }
          >
            {account.isArchived ? "보관 해제" : "보관 (해지한 계좌)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === "balance" ? `${account.name} 잔액 맞추기` : "계좌 수정"}</DialogTitle>
            <DialogDescription className="sr-only">계좌 정보를 변경합니다.</DialogDescription>
          </DialogHeader>
          {dialog === "balance" ? <BalanceForm id={account.id} type={account.type} current={balance} onDone={() => setDialog(null)} /> : null}
          {dialog === "edit" ? <AccountForm initial={account} env={env} onDone={() => setDialog(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
