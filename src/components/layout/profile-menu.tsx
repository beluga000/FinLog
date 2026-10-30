"use client";

import Link from "next/link";
import { CalendarClock, LogOut, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/features/household/actions";

/** 헤더 프로필 메뉴 — 탭에 없는 화면(설정·정기 거래)과 로그아웃 */
export function ProfileMenu({ name, householdName }: { name: string; householdName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="프로필 메뉴" />}>
        <UserRound />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {householdName} · {name}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/ledger/recurring" />}>
          <CalendarClock /> 정기 거래
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings /> 설정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOut /> 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
