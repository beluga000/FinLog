import Link from "next/link";
import { cn } from "cn";
import { formatCompactKRW } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/period";
import type { DateStr } from "@/lib/finance/types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: DateStr) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 가구 월 경계(start~end)에 맞춘 달력. 날짜를 누르면 그날 거래만 보기 */
export function MonthCalendar({
  range,
  daily,
  today,
  selected,
  hrefFor,
}: {
  range: { start: DateStr; end: DateStr };
  daily: Map<DateStr, { income: bigint; expense: bigint }>;
  today: DateStr;
  selected?: DateStr;
  hrefFor: (date: DateStr | null) => string;
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
          return (
            <Link
              key={d}
              href={hrefFor(isSel ? null : d)}
              scroll={false}
              aria-label={`${d}${v?.expense ? ` 지출 ${v.expense}원` : ""}`}
              aria-current={isSel ? "date" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center rounded-md px-0.5 py-1 text-xs hover:bg-muted",
                isSel && "bg-foreground text-background hover:bg-foreground",
              )}
            >
              <span className={cn("tabular", d === today && !isSel && "rounded-full bg-primary px-1.5 text-primary-foreground")}>
                {Number(d.slice(8))}
              </span>
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
