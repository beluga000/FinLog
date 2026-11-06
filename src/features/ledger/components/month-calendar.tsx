import Link from "next/link";
import { cn } from "cn";
import { holidayName, shortHolidayName } from "@/lib/finance/holidays";
import { formatCompactKRW } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: DateStr) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 가구 월 경계(start~end)에 맞춘 달력. 날짜를 누르면 그날 거래만 보기. 일요일·공휴일은 빨간 날짜 + 공휴일 이름 */
export function MonthCalendar({
  range,
  daily,
  today,
  selected,
  hrefFor,
  onSelect,
}: {
  range: { start: DateStr; end: DateStr };
  daily: Map<DateStr, { income: bigint; expense: bigint }>;
  today: DateStr;
  selected?: DateStr;
  /** 날짜를 링크로 (서버에서 다시 그림) */
  hrefFor?: (date: DateStr | null) => string;
  /** 날짜를 화면 안에서 바로 고름 (서버를 다시 거치지 않음) — 있으면 hrefFor 대신 쓴다 */
  onSelect?: (date: DateStr | null) => void;
}) {
  const days: (DateStr | null)[] = Array.from({ length: weekday(range.start) }, () => null);
  for (let d = range.start; d < range.end; d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);

  return (
    <div className="rounded-xl border p-2">
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAY.map((w, i) => (
          <div key={w} className={cn("py-1", i === 0 && "text-critical")}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
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
        })}
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
