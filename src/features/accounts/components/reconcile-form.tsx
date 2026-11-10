"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AmountInput } from "@/components/common/amount-input";
import { Money } from "@/components/common/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isLiability } from "@/lib/finance/balance";
import { formatCompactKRW } from "@/lib/finance/money";
import { isBalanceStale, netWorthDelta, toDisplay, toStored } from "@/lib/finance/reconcile";
import type { AccountType, DateStr } from "@/lib/finance/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import type { GoalShift } from "@/features/goals/queries";
import { recordBalances } from "../actions";
import type { ReconcileAccount } from "../queries";

/** 거래 흐름으로 잔액이 정확한 계좌는 1년 확인을 고를 이유가 없다 */
const YEARLY_CHOICE: AccountType[] = ["SAVINGS", "INVESTMENT", "PENSION", "REAL_ESTATE", "OTHER_ASSET", "LOAN"];

interface RowState {
  value: string;
  yearly: boolean;
  /** 1년에 한 번 계좌라 이번엔 묻지 않음 — [이번에 확인]으로 열 수 있다 */
  skipped: boolean;
}

function lastLabel(last: DateStr | null, today: DateStr): string {
  if (last === null) return "입력한 적 없어요";
  if (last === today) return "오늘 확인";
  const [, m, d] = last.split("-").map(Number);
  return `마지막 확인 ${m}월 ${d}일`;
}

/** 만원 단위 + 부호 (compact 표시는 + 를 붙이지 않는다) */
function Signed({ value, tone }: { value: bigint; tone?: "delta" }) {
  return (
    <span className={cn(tone === "delta" && value > 0n && "text-good", tone === "delta" && value < 0n && "text-warning")}>
      {value > 0n ? "+" : ""}
      <Money value={value} compact />
    </span>
  );
}

/** 저장 뒤 — 고친 잔액으로 목표에 모인 돈이 어떻게 바뀌었는지 */
function GoalShifts({ shifts, onDone }: { shifts: GoalShift[]; onDone: () => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">목표가 이렇게 바뀌었어요</p>
      <ul className="grid gap-2">
        {shifts.map((g) => {
          const pct = g.target > 0 ? Math.min(100, Math.round((g.after / g.target) * 100)) : 0;
          const before = g.target > 0 ? Math.min(100, Math.round((g.before / g.target) * 100)) : 0;
          return (
            <li key={g.id} className="grid gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{g.name}</span>
                <span className="shrink-0 text-xs font-medium">
                  <Signed value={BigInt(g.after - g.before)} tone="delta" />
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                <Money value={BigInt(g.before)} compact /> → <b className="font-semibold text-foreground"><Money value={BigInt(g.after)} compact /></b>
                {g.target > 0 ? ` · 목표 ${before}% → ${pct}%` : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/goals" className={buttonVariants({ variant: "outline", size: "lg" })}>
          목표 보기
        </Link>
        <Button size="lg" onClick={onDone}>
          자산으로
        </Button>
      </div>
    </div>
  );
}

const parse = (v: string): bigint | null => (/^-?\d+$/.test(v) ? BigInt(v) : null);

/** 잔액 한 번에 맞추기 — 앱 숫자와 다른 것만 고치고 나머지는 "그대로예요"로 저장 */
export function ReconcileForm({ accounts, today }: { accounts: ReconcileAccount[]; today: DateStr }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<GoalShift[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      accounts.map((a) => [
        a.id,
        {
          value: toDisplay(a.type, a.balance).toString(),
          yearly: a.balanceCheckYearly,
          skipped: a.balanceCheckYearly && !isBalanceStale(a.last, today, true),
        },
      ]),
    ),
  );
  const set = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const next = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const a of accounts) {
      const r = rows[a.id];
      const v = parse(r.value);
      if (!r.skipped && v !== null) m.set(a.id, toStored(a.type, v));
    }
    return m;
  }, [accounts, rows]);
  const changed = accounts.filter((a) => next.has(a.id) && next.get(a.id) !== a.balance);
  const delta = netWorthDelta(accounts, next);
  const asking = accounts.filter((a) => !rows[a.id].skipped).length;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await recordBalances(
        accounts.map((a) => ({ id: a.id, balance: rows[a.id].skipped ? null : rows[a.id].value || "0", yearly: rows[a.id].yearly })),
      );
      if (!r.ok) return setError(r.error);
      toast.success(
        changed.length
          ? `${changed.length}개 계좌를 고쳤어요 · 순자산 ${delta >= 0n ? "+" : ""}${formatCompactKRW(delta)}`
          : "모두 그대로예요. 확인 날짜만 남겼어요",
      );
      // 목표가 바뀌었으면 바로 넘어가지 않고 보여 준다
      if (r.data?.goals.length) return setShifts(r.data.goals);
      router.push("/assets");
    });

  if (shifts) return <GoalShifts shifts={shifts} onDone={() => router.push("/assets")} />;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">은행 앱의 숫자와 다르면 고쳐 주세요. 같으면 그냥 두면 돼요.</p>
      <ul className="grid gap-2">
        {accounts.map((a) => {
          const r = rows[a.id];
          const v = parse(r.value);
          const diff = v === null || r.skipped ? 0n : toStored(a.type, v) - a.balance;
          return (
            <li key={a.id} className={cn("grid gap-2 rounded-xl border bg-card p-3", r.skipped && "bg-muted/40")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[ACCOUNT_TYPE_LABEL[a.type], a.institution, lastLabel(a.last, today)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {r.skipped ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set(a.id, { skipped: false })}>
                    이번에 확인
                  </Button>
                ) : diff !== 0n ? (
                  <span className="shrink-0 text-xs font-medium">
                    {isLiability(a.type) ? "갚을 돈 " : ""}
                    <Signed value={isLiability(a.type) ? -diff : diff} />
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">그대로예요</span>
                )}
              </div>
              {r.skipped ? (
                <p className="text-xs text-muted-foreground">
                  1년에 한 번만 물어봐요 · 지금 <Money value={toDisplay(a.type, a.balance)} compact />
                </p>
              ) : (
                <AmountInput
                  id={`rc-${a.id}`}
                  value={r.value}
                  onChange={(value) => set(a.id, { value })}
                  allowNegative={!isLiability(a.type)}
                />
              )}
              {YEARLY_CHOICE.includes(a.type) ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={r.yearly} onChange={(e) => set(a.id, { yearly: e.target.checked })} />
                  거의 안 바뀌어요 · 1년에 한 번만 물어보기
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-1 grid gap-2 border-t bg-background px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">
            {asking}개 확인 · 바뀐 계좌 {changed.length}개
          </span>
          <span className="font-semibold">
            순자산 <Signed value={delta} tone="delta" />
          </span>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button size="lg" disabled={pending || accounts.length === 0} onClick={save}>
          {pending ? "저장 중…" : changed.length ? "저장하기" : "모두 그대로예요"}
        </Button>
      </div>
    </div>
  );
}
