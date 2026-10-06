import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { BottomTabBar, SidebarNav } from "@/components/layout/app-nav";
import { ScopeToggle } from "@/components/layout/scope-toggle";
import { logout } from "@/features/household/actions";
import { QuickAdd } from "@/features/ledger/components/quick-add";
import { getAccounts, getCategories } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireHousehold();
  const [accounts, categories] = await Promise.all([getAccounts(ctx, "us"), getCategories(ctx)]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r px-3 py-5 md:flex">
        <Link href="/dashboard" className="px-3 text-lg font-black tracking-tight">
          FINLOG
        </Link>
        <SidebarNav />
        <div className="mt-auto grid gap-2 px-3 text-xs text-muted-foreground">
          <div className="truncate">
            {ctx.household.name} · {ctx.user.name}
          </div>
          <form action={logout}>
            <button type="submit" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <LogOut className="size-3.5" /> 로그아웃
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:px-8">
          <div className="flex h-14 flex-1 items-center gap-3">
            <Link href="/dashboard" className="text-base font-black tracking-tight md:hidden">
              FINLOG
            </Link>
            {ctx.isCouple ? (
              <Suspense>
                <ScopeToggle partnerName={ctx.partner?.name ?? "배우자"} />
              </Suspense>
            ) : (
              <span className="hidden text-sm text-muted-foreground md:inline">개인 모드</span>
            )}
            <div className="ml-auto">
              <QuickAdd accounts={accounts} categories={categories} viewerId={ctx.userId} isCouple={ctx.isCouple} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pb-12">{children}</main>
      </div>
      <BottomTabBar />
    </div>
  );
}
