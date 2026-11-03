import type { NextConfig } from "next";

// 보안 헤더. 스크립트 CSP 는 Next 인라인 스크립트와 충돌하므로 넣지 않고,
// 부작용 없는 지시어(다른 사이트에 끼워넣기 금지·base 태그·플러그인)만 건다.
// form-action 은 넣지 않는다 — 소셜 로그인 폼이 카카오/구글로 리다이렉트되는 것까지 막는다.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
