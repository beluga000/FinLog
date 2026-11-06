import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ReconcileForm } from "@/features/accounts/components/reconcile-form";
import { getReconcileAccounts } from "@/features/accounts/queries";
import { requireHousehold } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "잔액 맞추기" };

/** 잔액 한 번에 맞추기 — 확인할 일(월급날·낡은 계좌)과 자산 화면에서 연다 */
export default async function ReconcilePage() {
  const ctx = await requireHousehold();
  const today = todayKST();
  const accounts = await getReconcileAccounts(ctx, { today });
  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <Link href="/assets" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 자산
      </Link>
      <PageHeader title="잔액 맞추기" description="오늘 기준으로 계좌 잔액을 한 번에 맞춰요." />
      {accounts.length ? (
        <ReconcileForm accounts={accounts} today={today} />
      ) : (
        <p className="text-sm text-muted-foreground">맞출 계좌가 없어요. 자산 화면에서 계좌를 먼저 추가해 주세요.</p>
      )}
    </div>
  );
}
