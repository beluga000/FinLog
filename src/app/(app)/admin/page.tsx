import { getSignupQueues, requireAdmin } from "@/features/admin/access";
import { SignupQueue } from "@/features/admin/components/signup-queue";

// 제목도 관리자에게만 — 비관리자는 메타데이터 단계에서 바로 404 (화면 존재를 드러내지 않음)
export async function generateMetadata() {
  await requireAdmin();
  return { title: "가입 승인" };
}

export default async function AdminPage() {
  await requireAdmin();
  const { pending, approved } = await getSignupQueues();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">가입 승인</h1>
        <p className="text-sm text-muted-foreground">승인한 사람만 로그인할 수 있어요.</p>
      </div>
      <SignupQueue pending={pending} approved={approved} />
    </div>
  );
}
