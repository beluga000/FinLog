import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/features/admin/access";
import { UserAdminList } from "@/features/admin/components/user-admin";
import { listUsers } from "@/features/admin/queries";

export async function generateMetadata() {
  await requireAdmin();
  return { title: "사용자 관리" };
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdmin();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const { rows, truncated } = await listUsers(q);
  return (
    <div className="grid gap-3">
      <form className="flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="이메일·이름 검색" className="h-9" aria-label="사용자 검색" />
        <Button type="submit" variant="outline">검색</Button>
      </form>
      <p className="px-1 text-xs text-muted-foreground">
        {q ? `'${q}' 검색 결과 ` : "최근 가입 순 "}
        {rows.length}명{truncated ? " (최대 200명까지 표시 — 검색으로 좁혀 보세요)" : ""}
      </p>
      <UserAdminList rows={rows} viewerId={admin.id} />
    </div>
  );
}
