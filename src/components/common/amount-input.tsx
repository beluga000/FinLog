"use client";

import { Input } from "@/components/ui/input";

const fmt = new Intl.NumberFormat("ko-KR");

/** 숫자만 받는 금액 입력. value 는 쉼표 없는 정수 문자열. */
export function AmountInput({
  id,
  value,
  onChange,
  placeholder = "0",
  allowNegative = false,
  quickAdd,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowNegative?: boolean;
  /** 빠른 더하기 버튼 (원) */
  quickAdd?: number[];
  autoFocus?: boolean;
}) {
  const display = value === "" || value === "-" ? value : fmt.format(BigInt(value));
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          className="h-11 pr-8 text-right text-lg font-semibold tabular"
          placeholder={placeholder}
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d-]/g, "");
            const neg = allowNegative && raw.startsWith("-");
            const digits = raw.replace(/-/g, "").replace(/^0+(?=\d)/, "");
            onChange(neg ? `-${digits}` : digits);
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">원</span>
      </div>
      {quickAdd?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {quickAdd.map((n) => (
            <button
              key={n}
              type="button"
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => onChange(String((value && value !== "-" ? BigInt(value) : 0n) + BigInt(n)))}
            >
              +{n >= 10000 ? `${n / 10000}만` : fmt.format(n)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
