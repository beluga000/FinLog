/**
 * FINLOG 마크 — '진척 F'. F 의 윗획이 진행 막대, 끝의 점이 목표.
 * 64×64 격자 한 색(currentColor). 앱 아이콘(src/app/icons)과 파비콘(public/icon.svg)도 같은 도형을 쓴다.
 */
export const LOGO_MARK_SHAPES = [
  { kind: "rect", x: 12, y: 10, width: 11, height: 44, rx: 5.5 },
  { kind: "rect", x: 12, y: 10, width: 28, height: 11, rx: 5.5 },
  { kind: "rect", x: 12, y: 28, width: 22, height: 10, rx: 5 },
  { kind: "circle", cx: 49, cy: 15.5, r: 6.5 },
] as const;

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" data-slot="logo-mark" className={className}>
      {LOGO_MARK_SHAPES.map((s, i) =>
        s.kind === "rect" ? (
          <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />
        ) : (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ),
      )}
    </svg>
  );
}

/** 마크 + 워드마크. 워드마크 글꼴은 테마가 정한다 (globals.css 의 data-slot="logo") */
export function Logo({ className, markClassName = "size-[1.35em]" }: { className?: string; markClassName?: string }) {
  return (
    <span className={className ? `inline-flex items-center gap-1.5 ${className}` : "inline-flex items-center gap-1.5"}>
      <LogoMark className={markClassName} />
      <span>FINLOG</span>
    </span>
  );
}
