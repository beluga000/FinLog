import { PageHeader } from "@/components/common/page-header";
import { getAccountOverview } from "@/features/accounts/queries";
import { getSavingCapacity } from "@/features/dashboard/queries";
import { Simulator } from "@/features/simulation/components/simulator";
import { requireHousehold } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "시뮬레이터" };

export default async function SimulatePage() {
  const ctx = await requireHousehold();
  const opts = { today: todayKST(), monthStartDay: ctx.household.monthStartDay };
  const [overview, capacity] = await Promise.all([
    getAccountOverview(ctx, "us", { ...opts, trendMonths: 1 }),
    getSavingCapacity(ctx, opts),
  ]);
  return (
    <div className="grid gap-5">
      <PageHeader title="자산 시뮬레이터" description="지금처럼 모으면 N년 뒤 얼마가 될까요? 값을 바꾸면 바로 다시 계산돼요." />
      <Simulator defaultPv={Number(overview.netWorth.netWorth)} defaultPmt={capacity.capacity} />
    </div>
  );
}
