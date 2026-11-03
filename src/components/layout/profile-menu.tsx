"use client";

import Link from "next/link";
import { CalendarClock, LogOut, MonitorSmartphone, Settings, ShieldCheck, UserRound, PiggyBank, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout, logoutEverywhere } from "@/features/household/actions";

/** 헤더 프로필 메뉴 — 탭에 없는 화면(설정·정기 거래)과 로그아웃(이 기기 / 모든 기기) */
export function ProfileMenu({
  name,
  householdName,
  pendingSignups = null,
}: {
  name: string;
  householdName: string;
  /** 관리자에게만 숫자(승인 대기 건수), 아니면 null */
  pendingSignups?: number | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={pendingSignups ? `프로필 메뉴 (가입 승인 대기 ${pendingSignups}명)` : "프로필 메뉴"} className="relative" />}
      >
        <UserRound />
        {pendingSignups ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive" aria-hidden /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {householdName} · {name}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/ledger/recurring" />}>
          <CalendarClock /> 정기 거래
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/assets/savings" />}>
          <PiggyBank /> 고정 저축
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/couple" />}>
          <Users /> 부부 설정
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings /> 설정
        </DropdownMenuItem>
        {pendingSignups !== null ? (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <ShieldCheck /> 가입 승인{pendingSignups ? ` (${pendingSignups})` : ""}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOut /> 로그아웃
        </DropdownMenuItem>
        {/* 휴대폰 분실 등: 다른 기기에 남은 로그인까지 모두 끊는다 */}
        <DropdownMenuItem onClick={() => void logoutEverywhere()}>
          <MonitorSmartphone /> 모든 기기에서 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
