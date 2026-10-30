import { BarChart3, Home, ReceiptText, Target, Wallet } from "lucide-react";

/** 탭 구조 (PROD.MD §2, AC-17) — 모바일 하단 탭과 데스크톱 사이드바가 같은 5개. 설정은 헤더 프로필 메뉴 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "홈", icon: Home },
  { href: "/ledger", label: "가계부", icon: ReceiptText },
  { href: "/goals", label: "목표", icon: Target },
  { href: "/assets", label: "자산", icon: Wallet },
  { href: "/reports", label: "리포트", icon: BarChart3 },
] as const;
