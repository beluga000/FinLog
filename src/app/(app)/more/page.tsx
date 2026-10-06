import Link from "next/link";
import { CalendarClock, Calculator, ChevronRight, LogOut, Settings } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { logout } from "@/features/household/actions";

export const metadata = { title: "더보기" };

const LINKS = [
  { href: "/simulate", label: "자산 시뮬레이터", desc: "N년 뒤 내 자산은 얼마일까", icon: Calculator },
  { href: "/ledger/recurring", label: "정기 거래", desc: "월급·월세·적금 자동 기록", icon: CalendarClock },
  { href: "/settings", label: "설정", desc: "가구·배우자 초대·카테고리·월 시작일", icon: Settings },
];

export default function MorePage() {
  return (
    <div className="grid gap-5">
      <PageHeader title="더보기" />
      <div className="divide-y rounded-xl border">
        {LINKS.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
            <Icon className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <form action={logout}>
        <button type="submit" className="inline-flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <LogOut className="size-4" /> 로그아웃
        </button>
      </form>
    </div>
  );
}
