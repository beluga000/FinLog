import { cn } from "cn";
import { formatCompactKRW, formatKRW } from "@/lib/finance/money";

/** 금액 표시. 색은 의미(증감)에만 쓰고 기본은 본문 색 */
export function Money({
  value,
  compact,
  sign,
  tone = "default",
  className,
}: {
  value: bigint | number;
  compact?: boolean;
  sign?: boolean;
  tone?: "default" | "delta" | "muted";
  className?: string;
}) {
  const n = typeof value === "bigint" ? value : BigInt(Math.round(value));
  const text = compact ? formatCompactKRW(n) : formatKRW(n, { sign });
  return (
    <span
      className={cn(
        "tabular",
        tone === "muted" && "text-muted-foreground",
        tone === "delta" && n > 0n && "text-good",
        tone === "delta" && n < 0n && "text-critical",
        className,
      )}
      title={formatKRW(n)}
    >
      {compact && sign && n > 0n ? "+" : ""}
      {text}
    </span>
  );
}
