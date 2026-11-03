import { requireAdmin } from "@/features/admin/access";
import { HouseholdAdminList } from "@/features/admin/components/household-admin";
import { listHouseholds } from "@/features/admin/queries";

export async function generateMetadata() {
  await requireAdmin();
  return { title: "가구 관리" };
}

export default async function AdminHouseholdsPage() {
  await requireAdmin();
  const rows = await listHouseholds();
  return (
    <div className="grid gap-3">
      <p className="px-1 text-xs text-muted-foreground">
        최근 기록 순 {rows.length}가구. 가구 관리자는 배우자 초대와 가구 설정(월 시작일 등)을 바꿀 수 있어요. 가구마다 한 명이에요.
      </p>
      <HouseholdAdminList rows={rows} />
    </div>
  );
}
