"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { SalaryBand } from "@/lib/finance/tax-accounts";
import { setSalaryBand } from "../actions";

/** 내 총급여 구간 — 고르면 연금 세액공제 환급액을 한 숫자로 보여 준다 (연봉 자체는 묻지 않는다) */
export function SalaryBandPicker({ value, thresholdLabel }: { value: SalaryBand | null; thresholdLabel: string }) {
  const [pending, start] = useTransition();
  const options: { v: SalaryBand | null; label: string }[] = [
    { v: "UNDER", label: `${thresholdLabel} 이하` },
    { v: "OVER", label: `${thresholdLabel} 초과` },
    { v: null, label: "모름" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">내 총급여</span>
      <div className="seg inline-grid grid-cols-3" role="radiogroup" aria-label="내 총급여 구간">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={pending}
            className="seg-item px-2 py-0.5"
            onClick={() =>
              start(async () => {
                const r = await setSalaryBand(o.v);
                if (!r.ok) toast.error(r.error);
              })
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
