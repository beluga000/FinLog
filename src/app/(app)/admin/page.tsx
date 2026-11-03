import { Card, CardContent } from "@/components/ui/card";
import { getSignupQueues, requireAdmin } from "@/features/admin/access";
import { SignupQueue } from "@/features/admin/components/signup-queue";
import { getAdminStats } from "@/features/admin/queries";

// 제목도 관리자에게만 — 비관리자는 메타데이터 단계에서 바로 404 (화면 존재를 드러내지 않음)
export async function generateMetadata() {
  await requireAdmin();
  return { title: "관리자" };
}

export default async function AdminPage() {
  await requireAdmin();
  const [{ pending, approved }, stats] = await Promise.all([getSignupQueues(), getAdminStats()]);
  const tiles = [
    { label: "전체 사용자", value: stats.users, sub: `최근 7일 가입 ${stats.newUsers}명` },
    { label: "승인 대기", value: stats.pending, sub: "승인해야 로그인 가능" },
    { label: "가구", value: stats.households, sub: `부부 ${stats.couples} · 개인 ${stats.households - stats.couples}` },
    { label: "활성 가구", value: stats.activeHouseholds, sub: "최근 30일 기록 있음" },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} size="sm">
            <CardContent className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">{t.label}</span>
              <span className="text-2xl font-black tabular">{t.value.toLocaleString("ko-KR")}</span>
              <span className="truncate text-xs text-muted-foreground">{t.sub}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <SignupQueue pending={pending} approved={approved} />
    </div>
  );
}
