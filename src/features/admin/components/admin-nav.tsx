"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/admin", label: "현황·가입 승인" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/households", label: "가구" },
];

export function AdminNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav aria-label="관리자 메뉴" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.href === "/admin" && pending > 0 ? <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-xs text-white">{pending}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
