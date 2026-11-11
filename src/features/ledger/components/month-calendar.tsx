"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { holidayName, shortHolidayName } from "@/lib/finance/holidays";
import { formatCompactKRW } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: DateStr) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function weekday(date: DateStr) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type CalendarView = "month" | "week";

/**
 * 가구 월 경계(start~end)에 맞춘 달력. 날짜를 누르면 그날 거래만 보기. 일요일·공휴일은 빨간 날짜 + 공휴일 이름.
 * 오른쪽 칸은 주별 지출 합계 — 누르면 그 주만 보기. "주"로 접으면 한 주만 보여 준다 (휴대폰에서 목록을 더 보이게).
 */
export function MonthCalendar({
  range,
  daily,
  today,
  selected,
  hrefFor,
  onSelect,
  selectedWeek,
  onSelectWeek,
  view = "month",
  onViewChange,
}: {
  range: { start: DateStr; end: DateStr };
  daily: Map<DateStr, { income: bigint; expense: bigint }>;
  today: DateStr;
  selected?: DateStr;
  /** 날짜를 링크로 (서버에서 다시 그림) */
  hrefFor?: (date: DateStr | null) => string;
  /** 날짜를 화면 안에서 바로 고름 (서버를 다시 거치지 않음) — 있으면 hrefFor 대신 쓴다 */
  onSelect?: (date: DateStr | null) => void;
  /** 고른 주 (그 주 첫날) */
  selectedWeek?: DateStr;
  /** 있으면 주별 합계 칸을 보여 주고 누르면 그 주를 고른다 */
  onSelectWeek?: (weekStart: DateStr | null) => void;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
}) {
  const days: (DateStr | null)[] = Array.from({ length: weekday(range.start) }, () => null);
  for (let d = range.start; d < range.end; d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => {
    const row = days.slice(i * 7, i * 7 + 7);
    const dates = row.filter((d): d is DateStr => d !== null);
    return { row, start: dates[0], end: dates[dates.length - 1], expense: dates.reduce((s, d) => s + (daily.get(d)?.expense ?? 0n), 0n) };
  });
  const weekOf = (d: DateStr | undefined) => (d ? weeks.findIndex((w) => w.start <= d && d <= w.end) : -1);
  // 주 보기에서 보여 줄 주: 고른 날 → 고른 주 → 오늘 → 첫 주
  const initialFocus = [weekOf(selected), weekOf(selectedWeek), weekOf(today)].find((i) => i >= 0) ?? 0;
  const [focus, setFocus] = useState(initialFocus);
  const shown = view === "week" ? [weeks[Math.min(focus, weeks.length - 1)]] : weeks;
  const withWeek = Boolean(onSelectWeek);
  const cols = withWeek ? "grid-cols-[repeat(7,minmax(0,1fr))_2.75rem]" : "grid-cols-7";

  return (
    <div className="rounded-xl border p-2">
      {onViewChange ? (
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <div role="group" aria-label="달력 보기" className="inline-flex rounded-full border p-0.5 text-[11px]">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  if (v === "week") setFocus(initialFocus);
                  onViewChange(v);
                }}
                className={cn("rounded-full px-2.5 py-0.5", view === v ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {v === "month" ? "월" : "주"}
              </button>
            ))}
          </div>
          {view === "week" ? (
            <div className="flex items-center gap-1 text-xs">
              <button type="button" aria-label="이전 주" disabled={focus <= 0} onClick={() => setFocus((f) => f - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular">
                {md(shown[0].start)} ~ {md(shown[0].end)}
              </span>
              <button
                type="button"
                aria-label="다음 주"
                disabled={focus >= weeks.length - 1}
                onClick={() => setFocus((f) => f + 1)}
                className="rounded p-1 hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("grid text-center text-[11px] text-muted-foreground", cols)}>
        {WEEKDAY.map((w, i) => (
          <div key={w} className={cn("py-1", i === 0 && "text-critical")}>{w}</div>
        ))}
        {withWeek ? <div className="py-1">주</div> : null}
      </div>
      <div className={cn("grid gap-0.5", cols)}>
        {shown.map((w) => [
          ...w.row.map((d, i) => {
            if (!d) return <div key={`${w.start}e${i}`} />;
            const v = daily.get(d);
            const isSel = selected === d;
            const holiday = holidayName(d);
            const red = holiday !== null || weekday(d) === 0;
            return (
              <DayCell
                key={d}
                href={onSelect ? undefined : hrefFor?.(isSel ? null : d)}
                onClick={onSelect ? () => onSelect(isSel ? null : d) : undefined}
                aria-label={`${d}${holiday ? ` ${holiday}` : ""}${v?.expense ? ` 지출 ${v.expense}원` : ""}`}
                title={holiday ?? undefined}
                aria-current={isSel ? "date" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center rounded-md px-0.5 py-1 text-xs hover:bg-muted",
                  isSel && "bg-foreground text-background hover:bg-foreground",
                )}
              >
                <span
                  className={cn(
                    "tabular",
                    red && !isSel && "text-critical",
                    d === today && !isSel && "rounded-full bg-primary px-1.5 text-primary-foreground",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {holiday ? (
                  <span className={cn("w-full truncate text-center text-[9px] leading-tight", isSel ? "text-background" : "text-critical")}>
                    {shortHolidayName(holiday)}
                  </span>
                ) : null}
                {v?.expense ? (
                  <span className={cn("mt-0.5 text-[10px] leading-none tabular", isSel ? "text-background" : "text-foreground")}>
                    -{formatCompactKRW(v.expense).replace("원", "")}
                  </span>
                ) : null}
                {v?.income ? (
                  <span className={cn("text-[10px] leading-tight tabular", isSel ? "text-background" : "text-good")}>
                    +{formatCompactKRW(v.income).replace("원", "")}
                  </span>
                ) : null}
              </DayCell>
            );
          }),
          withWeek ? (
            <button
              key={`${w.start}w`}
              type="button"
              onClick={() => onSelectWeek!(selectedWeek === w.start ? null : w.start)}
              aria-pressed={selectedWeek === w.start}
              aria-label={`${md(w.start)}~${md(w.end)} 주 지출 ${w.expense}원`}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-md bg-muted/50 text-[10px] leading-tight tabular hover:bg-muted",
                selectedWeek === w.start && "bg-foreground text-background hover:bg-foreground",
              )}
            >
              {w.expense ? `-${formatCompactKRW(w.expense).replace("원", "")}` : "·"}
            </button>
          ) : null,
        ])}
      </div>
    </div>
  );
}

/** 링크(href) 또는 버튼(onClick) — 같은 모양 */
function DayCell({
  href,
  onClick,
  ...props
}: { href?: string; onClick?: () => void } & Omit<React.ComponentProps<"button">, "onClick">) {
  if (href) return <Link href={href} scroll={false} {...(props as Omit<React.ComponentProps<typeof Link>, "href">)} />;
  return <button type="button" onClick={onClick} {...props} />;
}
