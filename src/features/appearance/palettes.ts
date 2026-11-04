/** 화면 테마(팔레트) — 색·글꼴·모양을 한 벌로 묶은 것. 밝게/어둡게(next-themes)와는 따로 고른다 */
export const PALETTES = ["forest", "sea", "dusk"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "forest";

/** 첫 화면 깜빡임을 막으려고 브라우저에도 같은 값을 둔다 (DB 가 기준, 이 값은 캐시) */
export const PALETTE_STORAGE_KEY = "finlog-palette";

export const PALETTE_META: Record<Palette, { name: string; motto: string; description: string }> = {
  forest: { name: "숲", motto: "또렷한 장부", description: "흰 바탕에 초록 하나. 숫자가 가장 먼저 보입니다." },
  sea: { name: "바다", motto: "잔잔한 은행 창구", description: "푸른 회색 바탕과 청록. 오래 보아도 눈이 편합니다." },
  dusk: { name: "저녁", motto: "하루 끝에 쓰는 일기장", description: "보랏빛 바탕, 명조 제목, 둥근 모서리." },
};

/** 설치 앱(PWA)의 상단 상태바 색 — 각 테마의 상단 헤더 바탕과 같게 (globals.css 의 topbar) */
export const PALETTE_THEME_COLOR: Record<Palette, { light: string; dark: string }> = {
  forest: { light: "#ffffff", dark: "#252525" },
  sea: { light: "#0e2433", dark: "#07111a" },
  dusk: { light: "#eeeaf9", dark: "#1b1829" },
};

/** <meta name="theme-color"> (밝게/어둡게 두 개)를 테마 색으로 바꾼다 */
export function applyThemeColor(p: Palette) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = (m.media ?? "").includes("dark") ? PALETTE_THEME_COLOR[p].dark : PALETTE_THEME_COLOR[p].light;
  });
}

export function isPalette(v: unknown): v is Palette {
  return typeof v === "string" && (PALETTES as readonly string[]).includes(v);
}

/** <head> 에서 그리기 전에 실행 — 저장된 팔레트를 <html data-palette> 에 반영 */
export const PALETTE_INIT_SCRIPT = `try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(${JSON.stringify(PALETTES)}.indexOf(p)>-1)document.documentElement.setAttribute("data-palette",p)}catch(e){}`;

export function applyPalette(p: Palette) {
  document.documentElement.setAttribute("data-palette", p);
  applyThemeColor(p);
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, p);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등) — 이번 화면에만 적용
  }
}
