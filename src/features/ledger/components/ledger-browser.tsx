"use client";

import { useState } from "react";
import { cn } from "cn";
import type { DateStr } from "@/lib/finance/types";
import { TYPE_FILTERS } from "../filters";
import type { CategoryRow, TxRow } from "../queries";
import { MonthCalendar } from "./month-calendar";
import type { AccountOption } from "./tx-form";
import { TxList } from "./tx-list";

interface Filters {
  type: string;
  day?: DateStr;
  account?: string;
}

/**
 * 가계부 달력 + 유형 칩 + 거래 목록. 이번 달 거래는 이미 다 받아 왔으므로
 * 날짜·유형·계좌 필터는 화면 안에서 바로 거르고 주소(?type=&day=&account=)만 바꾼다 — 누를 때마다 서버를 다시 거치지 않는다.
 */
export function LedgerBrowser({
  items,
  daily,
  range,
  today,
  initial,
  accounts,
  categories,
  viewerId,
  isCouple,
  partnerName,
}: {
  items: TxRow[];
  daily: [DateStr, { income: bigint; expense: bigint }][];
  range: { start: DateStr; end: DateStr };
  today: DateStr;
  initial: Filters;
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  partnerName: string;
}) {
  // 달·스코프가 바뀌면 페이지가 key 로 새로 만들어 주소의 필터에서 다시 시작한다
  const [filters, setFilters] = useState<Filters>(initial);

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries({ type: next.type, day: next.day, account: next.account })) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    // state 를 null 로 넘겨야 Next 라우터가 바뀐 주소를 알아챈다(useSearchParams·새로고침이 이 필터를 유지)
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };

  const typeFilter = TYPE_FILTERS.find((f) => f.value === filters.type) ?? TYPE_FILTERS[0];
  const day = filters.day && filters.day >= range.start && filters.day < range.end ? filters.day : undefined;
  const filtered = items.filter(
    (t) =>
      (!typeFilter.types.length || typeFilter.types.includes(t.type)) &&
      (!day || t.date === day) &&
      (!filters.account || t.fromAccountId === filters.account || t.toAccountId === filters.account),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid content-start gap-3">
        <MonthCalendar range={range} daily={new Map(daily)} today={today} selected={day} onSelect={(d) => update({ day: d ?? undefined })} />
      </div>
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={typeFilter.value === f.value}
              onClick={() => update({ type: f.value })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                typeFilter.value === f.value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
          {day ? (
            <button type="button" onClick={() => update({ day: undefined })} className="rounded-full bg-muted px-3 py-1 text-xs">
              {Number(day.slice(5, 7))}/{Number(day.slice(8))} 필터 해제 ✕
            </button>
          ) : null}
          {filters.account ? (
            <button type="button" onClick={() => update({ account: undefined })} className="rounded-full bg-muted px-3 py-1 text-xs">
              {accounts.find((a) => a.id === filters.account)?.name ?? "계좌"} 필터 해제 ✕
            </button>
          ) : null}
        </div>
        <TxList
          items={filtered}
          accounts={accounts}
          categories={categories}
          viewerId={viewerId}
          isCouple={isCouple}
          partnerName={partnerName}
        />
      </div>
    </div>
  );
}
