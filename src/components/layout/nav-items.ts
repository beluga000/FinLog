import { Calculator, Home, ReceiptText, Settings, Target, Wallet } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "홈", icon: Home, mobile: true },
  { href: "/ledger", label: "가계부", icon: ReceiptText, mobile: true },
  { href: "/assets", label: "자산", icon: Wallet, mobile: true },
  { href: "/goals", label: "목표", icon: Target, mobile: true },
  { href: "/simulate", label: "시뮬레이터", icon: Calculator, mobile: false },
  { href: "/settings", label: "설정", icon: Settings, mobile: false },
] as const;
