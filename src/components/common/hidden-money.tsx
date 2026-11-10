"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "cn";
import { Money } from "./money";

/**
 * 처음엔 가려 두고 누르면 보이는 금액 — 홈 화면을 남이 같이 볼 때 모은 돈이 바로 드러나지 않게.
 * 기억하지 않는다: 화면을 다시 열면 다시 가려진다. 가린 동안에는 금액을 화면·title 어디에도 넣지 않는다.
 */
export function HiddenMoney({ value, className, label = "금액", compact }: { value: number; className?: string; label?: string; compact?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={shown ? `${label} 가리기` : `${label} 보기`}
      onClick={() => setShown((s) => !s)}
      className={cn("inline-flex items-center gap-1.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", className)}
    >
      {shown ? (
        <Money value={value} compact={compact} />
      ) : (
        <>
          <span aria-hidden className="tracking-widest text-muted-foreground">
            ●●●●●●
          </span>
          <Eye aria-hidden className="size-4 text-muted-foreground" />
        </>
      )}
    </button>
  );
}
