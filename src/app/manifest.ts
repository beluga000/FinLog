import type { MetadataRoute } from "next";

/** PWA 설치 + Android 공유받기 (PROD.MD §2-5 모바일 수집, AC-20, AC-22) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINLOG — 목표까지 남은 거리",
    short_name: "FINLOG",
    description: "부부·개인 가계부와 목표 자산 시뮬레이션",
    lang: "ko",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#17693d",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // 문자 앱 [공유 → FINLOG]. 원문이 URL·로그에 남지 않게 POST 로 받는다
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text" },
    },
  } as MetadataRoute.Manifest;
}
