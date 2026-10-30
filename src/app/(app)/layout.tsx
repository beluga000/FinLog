import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { BottomTabBar, SidebarNav } from "@/components/layout/app-nav";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { ScopeToggle } from "@/components/layout/scope-toggle";
import { QuickAdd } from "@/features/ledger/components/quick-add";
import { getAccounts, getCategories } from "@/features/ledger/queries";
import { SHARED_TEXT_COOKIE } from "@/features/ledger/shared-text";
import { requireHousehold } from "@/lib/db/context";

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return undefined;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireHousehold();
  const [accounts, categories, cookieStore] = await Promise.all([getAccounts(ctx, "us"), getCategories(ctx), cookies()]);
  const shared = cookieStore.get(SHARED_TEXT_COOKIE)?.value;
  const sharedText = shared ? safeDecode(shared) : undefined;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r px-3 py-5 md:flex">
        <Link href="/dashboard" className="px-3 text-lg font-black tracking-tight">
          FINLOG
        </Link>
        <SidebarNav />
        <div className="mt-auto truncate px-3 text-xs text-muted-foreground">
          {ctx.household.name} · {ctx.user.name}
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
            <div className="ml-auto flex items-center gap-2">
              <QuickAdd
                accounts={accounts}
                categories={categories}
                viewerId={ctx.userId}
                isCouple={ctx.isCouple}
                sharedText={sharedText}
              />
              <ProfileMenu name={ctx.user.name ?? ""} householdName={ctx.household.name} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pb-12">{children}</main>
      </div>
      <BottomTabBar />
    </div>
  );
}
