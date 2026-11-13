import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker";
import { Toaster } from "@/components/ui/sonner";
import { APP_LOCK_INIT_SCRIPT } from "@/features/app-lock/lock";
import { DEFAULT_PALETTE, PALETTE_INIT_SCRIPT } from "@/features/appearance/palettes";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FINLOG", template: "%s · FINLOG" },
  description: "부부·개인 가계부와 목표 자산 시뮬레이션",
  applicationName: "FINLOG",
  appleWebApp: { capable: true, title: "FINLOG", statusBarStyle: "default" },
  icons: {
    // 브라우저 탭은 선명한 SVG, 못 읽는 브라우저는 PNG
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/192", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/180",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    // 기본 테마(노을)의 상단 헤더 바탕 — 다른 테마는 palette-sync 가 바꾼다
    { media: "(prefers-color-scheme: light)", color: "#fffaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#17110e" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-palette={DEFAULT_PALETTE} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* 저장된 화면 테마를 그리기 전에 적용 — 기본 테마가 잠깐 보였다 바뀌는 깜빡임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_INIT_SCRIPT }} />
        {/* 앱 잠금을 쓰는 기기면 내용을 그리기 전에 가린다 (features/app-lock) */}
        <script dangerouslySetInnerHTML={{ __html: APP_LOCK_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
