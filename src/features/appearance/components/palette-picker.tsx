"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { updatePalette } from "../actions";
import { applyPalette, DEFAULT_PALETTE, isPalette, PALETTE_META, PALETTES, type Palette } from "../palettes";

/** 설정 › 화면 테마. 카드를 누르면 바로 적용되고 계정에 저장된다 */
export function PalettePicker({ initial }: { initial: string }) {
  const [current, setCurrent] = useState<Palette>(isPalette(initial) ? initial : DEFAULT_PALETTE);
  const [pending, start] = useTransition();

  function choose(next: Palette) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    applyPalette(next);
    start(async () => {
      const r = await updatePalette(next);
      if (!r.ok) {
        setCurrent(prev);
        applyPalette(prev);
        toast.error(r.error);
      }
    });
  }

  return (
    <div role="radiogroup" aria-label="화면 테마" aria-busy={pending} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {PALETTES.map((p) => {
        const meta = PALETTE_META[p];
        const on = p === current;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(p)}
            className={cn(
              "grid gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              on ? "border-foreground" : "hover:bg-muted/50",
            )}
          >
            <ThemePreview palette={p} />
            <span className="flex items-start justify-between gap-2 px-0.5">
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">
                  {meta.name} <span className="font-normal text-muted-foreground">· {meta.motto}</span>
                </span>
                <span className="text-xs text-muted-foreground">{meta.description}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  on && "border-foreground bg-foreground text-background",
                )}
              >
                {on ? <Check className="size-3" /> : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 해당 테마의 토큰으로 그린 작은 홈 화면 — data-palette 를 안쪽에 걸어 그 테마 색·글꼴·모서리가 적용된다 */
function ThemePreview({ palette }: { palette: Palette }) {
  return (
    <span
      data-palette={palette}
      aria-hidden
      className="grid gap-2 rounded-lg bg-background p-2.5 text-foreground ring-1 ring-foreground/5"
    >
      <span className="font-heading text-sm font-bold">11월</span>
      <span className="grid gap-1.5 rounded-lg bg-card p-2 shadow-(--card-shadow)">
        <span className="text-[10px] text-muted-foreground">이번 달 남은 돈</span>
        <span className="tabular text-base font-bold leading-none">
          1,284,500<span className="ml-0.5 font-sans text-xs">원</span>
        </span>
        <span className="block h-(--progress-h) overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-2/3 rounded-full bg-brand" />
        </span>
      </span>
      <span className="flex justify-end">
        <span
          className={cn(
            "bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground",
            palette === "dusk" ? "rounded-full" : "rounded-md",
          )}
        >
          거래 추가
        </span>
      </span>
    </span>
  );
}
