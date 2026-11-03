import { requireAdmin } from "@/features/admin/access";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { prisma } from "@/lib/db/prisma";

/** 서비스 관리자 전용. 비관리자는 404 (화면이 있다는 것도 알리지 않음) */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const pending = await prisma.user.count({ where: { approvedAt: null } });
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">관리자</h1>
        <p className="text-sm text-muted-foreground">가입·계정·가구를 관리해요. 가계 금액과 거래 내용은 보이지 않아요.</p>
      </div>
      <AdminNav pending={pending} />
      {children}
    </div>
  );
}
