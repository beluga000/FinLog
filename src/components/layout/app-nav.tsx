"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-muted font-semibold text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** 모바일 하단 탭바: 홈 / 가계부 / 자산 / 목표 / 더보기 */
export function BottomTabBar() {
  const pathname = usePathname();
  const moreActive = ["/simulate", "/settings", "/ledger/recurring"].some((p) => isActive(pathname, p));
  const tabs = NAV_ITEMS.filter((i) => i.mobile);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href) && !(href === "/ledger" && pathname.startsWith("/ledger/recurring"));
          return (
            <Link
              key={href}
              href={href}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", active && "font-semibold text-foreground")}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
        <Link
          href="/more"
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", (moreActive || pathname === "/more") && "font-semibold text-foreground")}
        >
          <Menu className="size-5" />
          더보기
        </Link>
      </div>
    </nav>
  );
}
