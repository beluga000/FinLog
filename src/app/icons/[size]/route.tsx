import { ImageResponse } from "next/og";
import { LOGO_MARK_SHAPES } from "@/components/common/logo-mark";

const SIZES = new Set([180, 192, 512]);
const BRAND = "#17693d";

/**
 * 앱 아이콘 — 액센트 초록 바탕에 흰 '진척 F' 마크.
 * maskable 은 안드로이드가 원·물방울로 잘라도 남도록 안전 영역(가운데 80%) 안에 작게 둔다.
 * 180(애플)은 iOS 가 모서리를 직접 둥글리므로 사각형 그대로.
 */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  const mark = Math.round(size * (maskable ? 0.5 : 0.66));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND,
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 64 64" fill="#ffffff">
          {LOGO_MARK_SHAPES.map((s, i) =>
            s.kind === "rect" ? (
              <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />
            ) : (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            ),
          )}
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
