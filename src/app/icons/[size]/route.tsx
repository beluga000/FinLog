import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** 앱 아이콘 — 액센트 초록 바탕에 F. maskable 은 안전 영역(80%) 안에 글자를 둔다 */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17693d",
          color: "#ffffff",
          fontSize: size * (maskable ? 0.42 : 0.58),
          fontWeight: 900,
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        F
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
