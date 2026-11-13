"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays } from "@/lib/finance/period";
import { matchesTxQuery, parseTxQuery } from "@/lib/finance/tx-search";
import type { DateStr } from "@/lib/finance/types";
import { searchLedger } from "../actions";
import { TYPE_FILTERS } from "../filters";
import type { CategoryRow, TxRow } from "../queries";
import { MonthCalendar, type CalendarView } from "./month-calendar";
import type { AccountOption } from "./tx-form";
import { TxList } from "./tx-list";

interface Filters {
  type: string;
  day?: DateStr;
  /** 고른 주의 첫날 (달력 주 합계 칸) */
  week?: DateStr;
  account?: string;
}

const VIEW_KEY = "finlog.ledger.calendarView";

/**
 * 가계부 달력 + 검색 + 유형 칩 + 거래 목록. 이번 달 거래는 이미 다 받아 왔으므로
 * 날짜·주·유형·계좌·검색어는 화면 안에서 바로 거르고 주소(?type=&day=&week=&account=)만 바꾼다 — 누를 때마다 서버를 다시 거치지 않는다.
 * 이번 달 밖의 기록은 "전체 기간에서 찾기"로 서버에서 찾는다.
 */
export function LedgerBrowser({
  items,
  daily,
  range,
  today,
  scope,
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
  scope: string;
  initial: Filters;
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  partnerName: string;
}) {
  // 달·스코프가 바뀌면 페이지가 key 로 새로 만들어 주소의 필터에서 다시 시작한다
  const [filters, setFilters] = useState<Filters>(initial);
  const [view, setView] = useState<CalendarView>("month");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<{ q: string; items: TxRow[]; more: boolean } | null>(null);
  const [searching, startSearch] = useTransition();

  // 격자/월/주 보기는 기기마다 기억한다 (저장 공간이 막혀 있으면 월 보기)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "week" || saved === "heat") setView(saved);
    } catch {}
  }, []);
  const changeView = (v: CalendarView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries({ type: next.type, day: next.day, week: next.week, account: next.account })) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    // state 를 null 로 넘겨야 Next 라우터가 바뀐 주소를 알아챈다(useSearchParams·새로고침이 이 필터를 유지)
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };

  const typeFilter = TYPE_FILTERS.find((f) => f.value === filters.type) ?? TYPE_FILTERS[0];
  const day = filters.day && filters.day >= range.start && filters.day < range.end ? filters.day : undefined;
  const week = !day && filters.week && filters.week >= range.start && filters.week < range.end ? filters.week : undefined;
  const weekEnd = week ? addDays(week, 7) : undefined;
  const q = parseTxQuery(query);
  const filtered = items.filter(
    (t) =>
      (!typeFilter.types.length || typeFilter.types.includes(t.type)) &&
      (!day || t.date === day) &&
      (!week || (t.date >= week && t.date < weekEnd!)) &&
      (!filters.account || t.fromAccountId === filters.account || t.toAccountId === filters.account) &&
      (!q || matchesTxQuery(t, q)),
  );
  // 전체 기간 결과는 그 검색어 그대로일 때만 보여 준다
  const allResult = all && q && all.q === q.text ? all : null;

  const searchAll = () => {
    if (!q) return;
    startSearch(async () => {
      const r = await searchLedger(q.text, scope);
      if (!r.ok) return void toast.error(r.error);
      setAll({ q: q.text, items: r.data!.items, more: r.data!.more });
    });
  };

  const md = (d: DateStr) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid content-start gap-3">
        <MonthCalendar
          range={range}
          daily={new Map(daily)}
          today={today}
          selected={day}
          onSelect={(d) => update({ day: d ?? undefined, week: undefined })}
          selectedWeek={week}
          onSelectWeek={(w) => update({ week: w ?? undefined, day: undefined })}
          view={view}
          onViewChange={changeView}
        />
      </div>
      <div className="grid content-start gap-3">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            searchAll();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사용처·메모·카테고리·금액"
              aria-label="가계부 검색"
              className="h-9 pl-8"
              maxLength={50}
            />
          </div>
          {q ? (
            <Button type="submit" variant="outline" size="sm" className="h-9" disabled={searching}>
              전체 기간에서 찾기
            </Button>
          ) : null}
        </form>

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
              {md(day)} 필터 해제 ✕
            </button>
          ) : null}
          {week ? (
            <button type="button" onClick={() => update({ week: undefined })} className="rounded-full bg-muted px-3 py-1 text-xs">
              {md(week)}~{md(addDays(weekEnd! < range.end ? weekEnd! : range.end, -1))} 주 해제 ✕
            </button>
          ) : null}
          {filters.account ? (
            <button type="button" onClick={() => update({ account: undefined })} className="rounded-full bg-muted px-3 py-1 text-xs">
              {accounts.find((a) => a.id === filters.account)?.name ?? "계좌"} 필터 해제 ✕
            </button>
          ) : null}
        </div>

        {allResult ? (
          <section aria-label="전체 기간 검색 결과" className="grid gap-2">
            <div className="flex items-center justify-between gap-2 px-1 text-sm">
              <span>
                전체 기간에서 &lsquo;{allResult.q}&rsquo; <b className="font-semibold">{allResult.items.length}{allResult.more ? "건+" : "건"}</b>
                {allResult.more ? <span className="text-xs text-muted-foreground"> · 최근 것부터 {allResult.items.length}건만</span> : null}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setAll(null)} aria-label="전체 기간 결과 닫기">
                <X /> 이번 달로
              </Button>
            </div>
            <TxList items={allResult.items} accounts={accounts} categories={categories} viewerId={viewerId} isCouple={isCouple} partnerName={partnerName} />
          </section>
        ) : q && !filtered.length ? (
          <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
            이번 달에는 &lsquo;{q.text}&rsquo; 기록이 없어요. 전체 기간에서 찾아보세요.
          </p>
        ) : (
          <TxList items={filtered} accounts={accounts} categories={categories} viewerId={viewerId} isCouple={isCouple} partnerName={partnerName} />
        )}
      </div>
    </div>
  );
}
