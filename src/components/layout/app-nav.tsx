"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

/** 모바일 하단 탭바: 홈 / 가계부 / 목표 / 자산 / 리포트 */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav data-slot="tabbar" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            data-slot="tabbar-item"
            data-active={isActive(pathname, href) ? "" : undefined}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
              isActive(pathname, href) && "font-semibold",
            )}
          >
            {/* 선택 표시 모양은 테마가 정한다 (globals.css 의 tabbar) */}
            <span data-slot="tabbar-icon">
              <Icon className="size-5" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
