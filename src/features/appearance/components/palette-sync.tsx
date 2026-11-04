"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyPalette, applyThemeColor, DEFAULT_PALETTE, isPalette, PALETTE_STORAGE_KEY } from "../palettes";

/**
 * DB 에 저장된 테마를 이 기기에 맞춘다 — 다른 기기에서 바꿨거나 이 기기에 처음 로그인한 경우.
 * 첫 화면은 <head> 스크립트가 이 기기에 남은 값으로 그리고, 다르면 여기서 한 번 바로잡는다.
 */
export function PaletteSync({ palette }: { palette: string }) {
  // 화면을 옮기면 Next 가 <head> 메타를 다시 그릴 수 있어 상태바 색을 다시 맞춘다
  const pathname = usePathname();
  useEffect(() => {
    const target = isPalette(palette) ? palette : DEFAULT_PALETTE;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    } catch {
      // 저장소를 못 쓰는 환경
    }
    if (stored !== target || document.documentElement.getAttribute("data-palette") !== target) applyPalette(target);
    // 상태바 색은 서버가 기본값으로 그리므로 매번 맞춘다
    else applyThemeColor(target);
  }, [palette, pathname]);
  return null;
}
